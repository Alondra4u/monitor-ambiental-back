import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { pool } from "../db.js";

const router = Router();

const measurementSelect = `
  SELECT
    m.fecha_medicion AS fecha,
    m.hora_medicion AS hora,
    z.tipo AS estacion,
    z.nombre AS nombre_zona,
    m.co2_ppm AS co2,
    m.co_ppm AS co,
    m.nox_ppb AS nox,
    m.voc_ppb AS voc,
    m.temperatura,
    m.humedad
  FROM mediciones m
  JOIN dispositivos d ON m.id_dispositivo = d.id_dispositivo
  JOIN zonas z ON d.id_zona = z.id_zona
`;

const newestFirst = "ORDER BY m.fecha_medicion DESC, m.hora_medicion DESC";

function getMexicoTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}:${values.second}`,
  };
}

function isFiniteNumber(value) {
  return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
}

function shouldTriggerAlarm(value, minimum, maximum) {
  const min = minimum === null || minimum === undefined ? null : Number(minimum);
  const max = maximum === null || maximum === undefined ? null : Number(maximum);

  if (min !== null && max === null) return value > min;
  if (min === null && max !== null) return value < max;
  if (min !== null && max !== null) return value < min || value > max;
  return false;
}

router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(`${measurementSelect} ${newestFirst}`);
    res.json(rows);
  } catch (error) {
    console.error("Error consultando mediciones:", error);
    res.status(500).json({ message: "No se pudieron consultar las mediciones" });
  }
});

router.post("/", async (req, res) => {
  const ingestToken = process.env.INGEST_API_TOKEN;
  if (ingestToken) {
    const providedToken = req.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const expected = Buffer.from(ingestToken);
    const provided = Buffer.from(providedToken);
    const valid = expected.length === provided.length && timingSafeEqual(expected, provided);
    if (!valid) return res.status(401).json({ message: "Token de dispositivo inválido o faltante" });
  }

  const { id_dispositivo, temperatura, humedad, co2, co, voc, nox } = req.body ?? {};
  const deviceId = Number(id_dispositivo);
  const fields = { temperatura, humedad, co2, co, voc, nox };

  if (!Number.isInteger(deviceId) || deviceId < 1) {
    return res.status(400).json({ message: "id_dispositivo debe ser un entero positivo" });
  }
  const invalidField = Object.entries(fields).find(([, value]) => !isFiniteNumber(value));
  if (invalidField) {
    return res.status(400).json({ message: `El campo ${invalidField[0]} debe ser numérico` });
  }

  try {
    const { date, time } = getMexicoTimestamp();
    const values = [
      deviceId,
      date,
      time,
      Number(temperatura),
      Number(humedad),
      Number(co2),
      Number(co),
      Number(voc),
      Number(nox),
    ];

    const measurementByVariable = {
      co2: Number(co2),
      co: Number(co),
      voc: Number(voc),
      nox: Number(nox),
      temperatura: Number(temperatura),
      humedad: Number(humedad),
    };

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO mediciones (
          id_dispositivo, fecha_medicion, hora_medicion, temperatura, humedad,
          co2_ppm, co_ppm, voc_ppb, nox_ppb
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      );

      const [alarmConfigs] = await connection.execute(
        `SELECT id_config_alarma, nombre_variable, valor_minimo, valor_maximo
         FROM configuraciones_alarmas
         WHERE esta_activa = 1
           AND (id_dispositivo = ? OR id_dispositivo IS NULL)
           AND nombre_variable IN ('co2', 'co', 'voc', 'nox', 'temperatura', 'humedad')`,
        [deviceId]
      );

      const events = alarmConfigs
        .filter((config) =>
          shouldTriggerAlarm(
            measurementByVariable[config.nombre_variable],
            config.valor_minimo,
            config.valor_maximo
          )
        )
        .map((config) => [
          config.id_config_alarma,
          result.insertId,
          deviceId,
          config.nombre_variable,
          measurementByVariable[config.nombre_variable],
        ]);

      if (events.length > 0) {
        await connection.query(
          `INSERT INTO eventos_alarma (
            id_config_alarma, id_medicion, id_dispositivo, nombre_variable, valor
          ) VALUES ?`,
          [events]
        );
      }

      await connection.commit();
      res.status(201).json({ ok: true, id_medicion: result.insertId });
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error guardando medición:", error);
    res.status(500).json({ message: "No se pudo guardar la medición" });
  }
});

// Dashboard payload: bounded recent rows plus daily averages, regardless of
// whether the sensor has sent a reading in the last hour.
router.get("/dashboard", async (_req, res) => {
  try {
    const [registros, promedios] = await Promise.all([
      pool.query(`${measurementSelect} ${newestFirst} LIMIT 50`),
      pool.query(`
        SELECT
          m.fecha_medicion AS fecha,
          z.tipo AS estacion,
          AVG(m.co2_ppm) AS co2
        FROM mediciones m
        JOIN dispositivos d ON m.id_dispositivo = d.id_dispositivo
        JOIN zonas z ON d.id_zona = z.id_zona
        WHERE m.fecha_medicion IN (
          SELECT fecha_medicion
          FROM (
            SELECT DISTINCT fecha_medicion
            FROM mediciones
            ORDER BY fecha_medicion DESC
            LIMIT 5
          ) AS dias_recientes
        )
        GROUP BY m.fecha_medicion, z.tipo
        ORDER BY m.fecha_medicion ASC
      `),
    ]);

    res.json({ registros: registros[0], promedios: promedios[0] });
  } catch (error) {
    console.error("Error consultando datos del dashboard:", error);
    res.status(500).json({ message: "No se pudieron consultar los datos del dashboard" });
  }
});

router.get("/ultimahora", async (_req, res) => {
  try {
    const cutoff = getMexicoTimestamp(new Date(Date.now() - 60 * 60 * 1000));
    const [rows] = await pool.query(
      `${measurementSelect}
       WHERE (m.fecha_medicion > ?)
          OR (m.fecha_medicion = ? AND m.hora_medicion >= ?)
       ${newestFirst}`,
      [cutoff.date, cutoff.date, cutoff.time]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error consultando la última hora:", error);
    res.status(500).json({ message: "No se pudieron consultar las mediciones de la última hora" });
  }
});

router.get("/hoy", async (_req, res) => {
  try {
    const { date } = getMexicoTimestamp();
    const [rows] = await pool.query(
      `${measurementSelect} WHERE m.fecha_medicion = ? ${newestFirst}`,
      [date]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error consultando mediciones de hoy:", error);
    res.status(500).json({ message: "No se pudieron consultar las mediciones de hoy" });
  }
});

router.get("/ultimos7dias", (req, res) => getRecentRecordedDays(req, res, 7));
router.get("/ultimos30dias", (req, res) => getRecentRecordedDays(req, res, 30));

async function getRecentRecordedDays(_req, res, numberOfDays) {
  try {
    const [rows] = await pool.query(
      `${measurementSelect}
       WHERE m.fecha_medicion IN (
         SELECT fecha_medicion
         FROM (
           SELECT DISTINCT fecha_medicion
           FROM mediciones
           ORDER BY fecha_medicion DESC
           LIMIT ?
         ) AS recent_days
       )
       ${newestFirst}`,
      [numberOfDays]
    );
    res.json(rows);
  } catch (error) {
    console.error(`Error consultando los últimos ${numberOfDays} días con registros:`, error);
    res.status(500).json({ message: "No se pudieron consultar las mediciones del periodo" });
  }
}

export default router;

import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/activos", async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(String(req.query.limit ?? "50"), 10);
    const requestedOffset = Number.parseInt(String(req.query.offset ?? "0"), 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 50)
      : 50;
    const offset = Number.isFinite(requestedOffset)
      ? Math.max(requestedOffset, 0)
      : 0;

    const [rows] = await pool.query(`
      SELECT
        e.id_evento_alarma,
        e.id_dispositivo,
        e.nombre_variable,
        e.valor,
        e.fecha_disparo,
        e.estatus,
        c.nivel_severidad,
        d.nombre AS nombre_dispositivo
      FROM eventos_alarma e
      JOIN configuraciones_alarmas c ON e.id_config_alarma = c.id_config_alarma
      LEFT JOIN dispositivos d ON e.id_dispositivo = d.id_dispositivo
      WHERE e.estatus = 'ACTIVA'
      ORDER BY e.fecha_disparo DESC
      LIMIT ? OFFSET ?
    `, [limit + 1, offset]);
    res.json({
      items: rows.slice(0, limit),
      hasMore: rows.length > limit,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error consultando eventos de alarma activos:", error);
    res.status(500).json({ message: "No se pudieron consultar las alarmas activas" });
  }
});

router.patch("/:id/resolver", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: "El id del evento debe ser un entero positivo" });
  }

  try {
    const [result] = await pool.query(
      "UPDATE eventos_alarma SET estatus = 'RESUELTA' WHERE id_evento_alarma = ?",
      [id]
    );
    if (result.affectedRows === 0) {
      const [rows] = await pool.query(
        "SELECT id_evento_alarma FROM eventos_alarma WHERE id_evento_alarma = ?",
        [id]
      );
      if (!rows.length) return res.status(404).json({ message: "Evento de alarma no encontrado" });
    }
    res.json({ ok: true, message: "Alarma marcada como resuelta" });
  } catch (error) {
    console.error("Error resolviendo evento de alarma:", error);
    res.status(500).json({ message: "No se pudo resolver la alarma" });
  }
});

export default router;

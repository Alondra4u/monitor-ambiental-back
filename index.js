import "dotenv/config";
import express from "express";
import cors from "cors";

import { pool } from "./db.js";
import alarmasRouter from "./routes/alarmas.js";
import eventosRouter from "./routes/eventos.js";
import medicionesRouter from "./routes/mediciones.js";

const app = express();
const port = Number(process.env.PORT) || 3000;
const allowedOrigins = (process.env.FRONTEND_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(cors({
  origin(origin, callback) {
    // Dispositivos y herramientas de línea de comandos pueden no enviar Origin.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    const error = new Error("Origen no permitido por CORS");
    error.status = 403;
    return callback(error);
  },
}));
app.use(express.json({ limit: "32kb" }));

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Health check: base de datos no disponible", error);
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.use("/api/mediciones", medicionesRouter);
app.use("/api/alarmas", alarmasRouter);
app.use("/api/eventos-alarma", eventosRouter);

app.use((_req, res) => {
  res.status(404).json({ message: "Recurso no encontrado" });
});

// Respuestas consistentes para JSON mal formado, CORS y errores no previstos.
app.use((error, _req, res, _next) => {
  console.error("Error de API:", error);
  const status = Number(error.status) || (error.type === "entity.parse.failed" ? 400 : 500);
  res.status(status).json({
    message: status === 500 ? "Error interno del servidor" : error.message,
  });
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`API de Monitor Ambiental disponible en el puerto ${port}`);
});

async function shutdown(signal) {
  console.log(`${signal}: cerrando API...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

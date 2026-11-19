import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const here = path.dirname(fileURLToPath(import.meta.url));
const sslEnabled = process.env.DB_SSL !== "false";
const caPath = process.env.DB_SSL_CA_PATH?.trim() || "ca.pem";
const ssl = !sslEnabled
  ? undefined
  : caPath.toLowerCase() === "system"
    ? {}
    : { ca: fs.readFileSync(path.resolve(here, caPath)) };

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  ssl,
});

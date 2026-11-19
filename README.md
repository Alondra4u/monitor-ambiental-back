# Monitor Ambiental — API

API REST para recibir mediciones de los sensores y consultar el historial y las alarmas. Está construida con Node.js, Express y MySQL.

## Endpoints

Todas las respuestas de consulta son JSON. Las mediciones se devuelven de la más reciente a la más antigua.

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/health` | Comprueba que la API y MySQL respondan. Devuelve `503` si la base de datos no está disponible. |
| `GET` | `/api/mediciones` | Todas las mediciones. |
| `POST` | `/api/mediciones` | Registra una medición enviada por un dispositivo. |
| `GET` | `/api/mediciones/ultimahora` | Mediciones de la última hora. |
| `GET` | `/api/mediciones/hoy` | Mediciones del día actual en la zona horaria de Monterrey. |
| `GET` | `/api/mediciones/ultimos7dias` | Mediciones de las 7 fechas más recientes que tienen registros. |
| `GET` | `/api/mediciones/ultimos30dias` | Mediciones de las 30 fechas más recientes que tienen registros. |
| `GET` | `/api/alarmas` | Lista las reglas de alarma configuradas. |
| `POST` | `/api/alarmas` | Crea o actualiza la regla para una variable y dispositivo. |
| `PATCH` | `/api/alarmas/:id` | Cambia el estado o la severidad de una regla. |
| `DELETE` | `/api/alarmas/:id` | Elimina una regla de alarma. |
| `GET` | `/api/eventos-alarma/activos` | Lista eventos de alarma activos. |
| `PATCH` | `/api/eventos-alarma/:id/resolver` | Marca un evento como resuelto. |

`ultimos7dias` y `ultimos30dias` cuentan fechas con datos, no periodos de calendario; si el sensor no registró datos algunos días, pueden abarcar más días naturales. El historial completo no tiene paginación todavía.

### Registrar una medición

`POST /api/mediciones` espera `id_dispositivo` y valores numéricos para `temperatura`, `humedad`, `co2`, `co`, `voc` y `nox`. La fecha y la hora las asigna la API usando `America/Monterrey`.

```json
{
  "id_dispositivo": 1,
  "temperatura": 25.4,
  "humedad": 43,
  "co2": 412,
  "co": 0.3,
  "voc": 12,
  "nox": 8
}
```

Si defines `INGEST_API_TOKEN`, el sensor también debe enviar `Authorization: Bearer <token>`. La variable es opcional para conservar compatibilidad con la configuración actual.

Después de guardar cada medición, la API evalúa las configuraciones de alarma activas para ese dispositivo y registra los eventos que cruzan sus límites, dentro de la misma transacción. Esto reemplaza el trigger de MySQL, porque TiDB Cloud Starter no admite triggers.

### Configurar una alarma

`POST /api/alarmas` acepta `station` (`Rural` o `Urbana`), `parameter` (`CO2`, `CO`, `NOx`, `VOC`, `Temperatura` o `Humedad`), `operator` (`>` o `<`), `threshold` y opcionalmente `nivel_severidad` (`1`, `2` o `3`) y `enabled` (booleano). El esquema de base de datos guarda límites mínimo/máximo y no conserva operadores inclusivos, por eso la API solo acepta `>` y `<`. Si se omite `id_dispositivo`, la API selecciona un dispositivo activo de la estación indicada. Guardar una regla para el mismo dispositivo y variable actualiza la existente.

## Desarrollo local

Requiere Node.js 20 o superior y una base MySQL con las tablas `mediciones`, `dispositivos`, `zonas`, `configuraciones_alarmas` y `eventos_alarma`.

```powershell
npm install
Copy-Item .env.example .env
```

Completa `.env` con las credenciales de la base de datos y ejecuta `npm run dev`. La API estará en `http://localhost:3000`.

## Despliegue

En Render usa un Web Service con build command `npm install` y start command `npm start`. Configura las variables de base de datos, `FRONTEND_ORIGINS` con el origen publicado del frontend, y opcionalmente `INGEST_API_TOKEN`. `DB_SSL=true` habilita TLS. `DB_SSL_CA_PATH=ca.pem` usa el certificado incluido de Aiven; `DB_SSL_CA_PATH=system` usa las autoridades raíz del sistema, apropiado para TiDB Cloud Starter.

`GET` es de solo lectura, pero la administración de alarmas todavía no tiene autenticación. CORS limita los orígenes de navegador permitidos; no sustituye autenticación. Antes de exponer públicamente la administración, agrega inicio de sesión o una capa de autorización adecuada.

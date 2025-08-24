# Bólidos Rifas — API + Frontend (vanilla)

> **Resumen**: Sitio informativo + captura de datos y comprobantes. La validación y asignación de números se hace en el panel admin (manual). No se muestran números en la web.

## Estructura

frontend/
index.html
style.css
script.js
server/
server.js
sql/init.sql
render.yaml
.env.example


## Variables de entorno

Copiar `server/.env.example` a `server/.env` y completá:

- `DATABASE_URL` Postgres (Render/Neon).
- `JWT_SECRET` aleatorio largo.
- `FRONTEND_ORIGIN` dominio del front (Vercel/GitHub Pages).
- `ADMIN_EMAIL` y `ADMIN_PASSWORD`: el servidor genera el **hash** al iniciar (no se guarda en plano).
- SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) para enviar emails.
- `CLOUDINARY_*` para subir comprobantes.
- `RECAPTCHA_SECRET` si habilitás reCAPTCHA v3.
- `ASSIGN_MODE` = `secuencial` o `aleatorio`.

## Inicialización de DB

Ejecutar `server/sql/init.sql` en tu base (psql/Beekeeper/DBeaver). Crea tablas e inserta 10.000 tickets `available`. Inserta también el admin (solo email). Al iniciar el server, se actualiza el `password_hash` con `ADMIN_PASSWORD`.

## Desarrollo local

```bash
cd server
npm i express helmet cors express-rate-limit bcrypt jsonwebtoken multer cloudinary pg morgan nodemailer express-validator dotenv
node server.js

El API arranca en http://localhost:10000.

Endpoints

GET /health → status.
GET /api/stats → { sold, total }.
POST /api/auth/login { email, password } → { token }.
POST /api/purchase (multipart/form-data) → { id }. Campos requeridos: full_name, document, country_code, phone, qty, price, receipt.
GET /api/verify?phone=... o ?ticket=1234 → { status, masked_numbers[] } (Nunca expone números completos).
POST /api/admin/confirm (Bearer) { purchase_id, status: approved|rejected }:
approved: asigna tickets libres en transacción, guarda sufijos (****1234), envía email.
rejected: solo marca como rechazado.

Seguridad

CORS restringido a FRONTEND_ORIGIN.
Helmet + CSP básica.
Rate limit global.
Uploads validados (jpeg/png/webp, ≤ 5MB).
JWT (8h) para admin.

Deploy
Backend (Render)

Crear servicio Web en Render, Node 18.
Agregar variables de entorno (ver .env.example).
Conectar Postgres (Render/Neon) y ejecutar sql/init.sql.
Deploy (render.yaml listo para importar).
Frontend (Vercel / GitHub Pages)
Subir carpeta frontend/.
Editar WhatsApp en script.js (setWhatsApp(...)), imágenes en frontend/img/.
Configurar data-endpoint-* en <body> si tu API no está en el mismo dominio.

Postman

Importá server/postman_collection.json para probar login, purchase, verify, confirm.

Notas

El verificador devuelve solo sufijos enmascarados (****1234).
Si /api/stats no está disponible, el front usa un fallback.
Para ampliar el panel admin (listados, filtros, export CSV), crear nuevas rutas: GET /api/admin/purchases?status=&page=.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1) conectar usando tu .env (DATABASE_URL ya la pusiste)
const connStr = process.env.DATABASE_URL_EXTERNAL || process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: connStr,
  ssl: connStr.includes('render.com')
    ? { rejectUnauthorized: false }
    : undefined,
});

// 2) leer el SQL
const sqlPath = path.join(__dirname, '..', 'sql', 'init.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

(async () => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(sql);  // ejecuta todo el archivo
    await client.query('commit');
    console.log('✅ init.sql ejecutado OK');
  } catch (e) {
    await client.query('rollback');
    console.error('❌ Error al ejecutar init.sql:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();

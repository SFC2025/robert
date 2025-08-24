import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const connStr = process.env.DATABASE_URL_EXTERNAL || process.env.DATABASE_URL;
const pool = new Pool({
  connectionString: connStr,
  ssl: connStr.includes('render.com') ? { rejectUnauthorized: false } : undefined,
});

const { rows } = await pool.query('select count(*) from tickets where event_id=1');
console.log(`🎫 Tickets cargados: ${rows[0].count}`);
await pool.end();

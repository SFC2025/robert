import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false } : undefined,
});

const sql = `
  select table_name
  from information_schema.tables
  where table_schema='public'
  order by table_name;
`;

const { rows } = await pool.query(sql);
console.log('Tablas:', rows.map(r => r.table_name));
await pool.end();

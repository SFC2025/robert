import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const connectionString =
  process.env.DATABASE_URL_EXTERNAL || process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes('render.com')
    ? { rejectUnauthorized: false }
    : undefined,
});

export default pool;


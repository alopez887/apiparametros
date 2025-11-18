import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  ssl: { rejectUnauthorized: false },
  max: Number(process.env.PG_MAX || 5),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  application_name: process.env.APP_NAME || 'api-parametros'
});

/* 👇 AQUÍ forzamos zona horaria Mazatlán para todas las conexiones */
pool.on('connect', (client) => {
  client
    .query("SET TIME ZONE 'America/Mazatlan'")
    .catch(err => console.error('Error setting timezone', err));
});

export default pool;
export { pool };

// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './conexion.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- Ruta base de prueba ---
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'api-parametros', msg: 'API Parámetros OK' });
});

/*
  ============================
  API TIPO DE CAMBIO
  Tabla: public.tipo_cambio
  Campos:
    id              integer PK
    mxn_enabled     boolean
    tipo_cambio_mxn numeric(10,4)
    updated_at      timestamp  <-- ya SIN time zone
  Usamos SIEMPRE id = 1 como único registro.
  ============================
*/

// GET /api/tipo-cambio  -> leer valor actual
app.get('/api/tipo-cambio', async (req, res) => {
  try {
    const sql = `
      SELECT id, mxn_enabled, tipo_cambio_mxn, updated_at
      FROM tipo_cambio
      WHERE id = 1
      LIMIT 1;
    `;
    const { rows } = await pool.query(sql);

    if (!rows.length) {
      return res.status(404).json({ error: 'No existe registro id=1 en tipo_cambio' });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error('Error GET /api/tipo-cambio:', err);
    return res.status(500).json({ error: 'Error al obtener tipo de cambio' });
  }
});

// POST /api/tipo-cambio  -> guardar/actualizar
app.post('/api/tipo-cambio', async (req, res) => {
  try {
    let { mxn_enabled, tipo_cambio_mxn } = req.body || {};

    // Normalizar booleano
    const enabled = (
      mxn_enabled === true  ||
      mxn_enabled === 'true' ||
      mxn_enabled === 1      ||
      mxn_enabled === '1'
    );

    // Validar tipo de cambio
    const tc = Number(tipo_cambio_mxn);
    if (!Number.isFinite(tc) || tc <= 0) {
      return res
        .status(400)
        .json({ error: 'tipo_cambio_mxn inválido. Debe ser un número mayor a 0.' });
    }

    // UPSERT sobre id = 1
    const sql = `
      INSERT INTO tipo_cambio (id, mxn_enabled, tipo_cambio_mxn, updated_at)
      VALUES (1, $1, $2, now() AT TIME ZONE 'America/Mazatlan')
      ON CONFLICT (id)
      DO UPDATE SET
        mxn_enabled     = EXCLUDED.mxn_enabled,
        tipo_cambio_mxn = EXCLUDED.tipo_cambio_mxn,
        updated_at      = now() AT TIME ZONE 'America/Mazatlan'
      RETURNING id, mxn_enabled, tipo_cambio_mxn, updated_at;
    `;

    const { rows } = await pool.query(sql, [enabled, tc]);

    return res.json(rows[0]);
  } catch (err) {
    console.error('Error POST /api/tipo-cambio:', err);
    return res.status(500).json({ error: 'Error al guardar tipo de cambio' });
  }
});

// --- Arranque del servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API-Parametros escuchando en puerto ${PORT}`);
});
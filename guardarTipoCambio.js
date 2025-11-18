// guardarTipoCambio.js
import pool from './conexion.js';

/*
  POST /api/tipo-cambio
  Body esperado:
    {
      mxn_enabled: true/false | "true"/"false" | 1/0 | "1"/"0",
      tipo_cambio_mxn: número > 0
    }
  Hace UPSERT sobre id = 1 en tipo_cambio
*/
export async function guardarTipoCambio(req, res) {
  try {
    let { mxn_enabled, tipo_cambio_mxn } = req.body || {};

    // Normalizar booleano
    const enabled =
      mxn_enabled === true ||
      mxn_enabled === 'true' ||
      mxn_enabled === 1 ||
      mxn_enabled === '1';

    // Validar tipo de cambio
    const tc = Number(tipo_cambio_mxn);
    if (!Number.isFinite(tc) || tc <= 0) {
      return res
        .status(400)
        .json({ error: 'tipo_cambio_mxn inválido. Debe ser un número mayor a 0.' });
    }

    // IMPORTANTE:
    // updated_at es timestamp (sin zona) y queremos hora local Mazatlán
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
}

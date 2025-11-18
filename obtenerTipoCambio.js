// obtenerTipoCambio.js
import pool from './conexion.js';

/*
  GET /api/tipo-cambio
  Lee el único registro (id = 1) de la tabla tipo_cambio
*/
export async function obtenerTipoCambio(req, res) {
  try {
    const sql = `
      SELECT id, mxn_enabled, tipo_cambio_mxn, updated_at
      FROM tipo_cambio
      WHERE id = 1
      LIMIT 1;
    `;

    const { rows } = await pool.query(sql);

    if (!rows.length) {
      return res
        .status(404)
        .json({ error: 'No existe registro id=1 en tipo_cambio' });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error('Error GET /api/tipo-cambio:', err);
    return res.status(500).json({ error: 'Error al obtener tipo de cambio' });
  }
}

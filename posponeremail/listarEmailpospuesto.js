// /posponeremail/listarEmailpospuesto.js
import pool from '../conexion.js';

/**
 * GET /api/correos-reservacion-error/pospuestos
 * Devuelve SOLO el total de reservaciones con email_pospuesto = true
 * (sin tocar la validación de email_reservacion)
 */
export async function contarCorreosPospuestos(req, res) {
  try {
    const sql = `
      SELECT COUNT(*) AS total
      FROM reservaciones
      WHERE email_pospuesto = true
    `;

    const { rows } = await pool.query(sql);
    const total = Number(rows?.[0]?.total || 0);

    return res.json({ ok: true, total });
  } catch (err) {
    console.error('❌ contarCorreosPospuestos:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error al contar correos pospuestos'
    });
  }
}

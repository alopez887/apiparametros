// /apiparametros/posponeremail/posponerEmail.js 
import pool from '../../conexion.js';

/**
 * POST /api/correos-reservacion-error/posponer
 * Body: { folio }
 *
 * ✅ NO toca email_reservacion
 * ✅ Solo marca email_pospuesto = true
 */
export async function posponerEmail(req, res) {
  try {
    const folio = String(req.body?.folio ?? '').trim();

    if (!folio) {
      return res.status(400).json({ ok: false, error: 'Folio requerido' });
    }

    // ✅ NO modificamos email_reservacion
    const q = `
      UPDATE reservaciones
      SET email_pospuesto = true
      WHERE folio = $1
      RETURNING folio, email_pospuesto
    `;

    const { rowCount, rows } = await pool.query(q, [folio]);

    if (!rowCount) {
      return res.status(404).json({ ok: false, error: 'No se encontró el folio' });
    }

    return res.json({
      ok: true,
      folio: rows[0].folio,
      email_pospuesto: rows[0].email_pospuesto
    });
  } catch (err) {
    console.error('❌ [POSPONER_EMAIL] Error:', err);
    return res.status(500).json({ ok: false, error: 'Error interno al posponer el envío' });
  }
}

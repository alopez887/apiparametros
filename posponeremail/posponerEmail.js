// /posponeremail/posponerEmail.js
import pool from '../conexion.js';

export async function posponerEmail(req, res) {
  try {
    const folio = String(req.body?.folio ?? '').trim();
    if (!folio) {
      return res.status(400).json({ ok: false, error: 'Folio requerido' });
    }

    // ✅ NO tocar email_reservacion
    // ✅ SOLO marcar email_pospuesto = true
    const q = `
      UPDATE reservaciones
      SET email_pospuesto = true
      WHERE folio = $1
      RETURNING folio, email_pospuesto
    `;
    const r = await pool.query(q, [folio]);

    if (!r.rowCount) {
      return res.status(404).json({ ok: false, error: 'Folio no encontrado' });
    }

    return res.json({ ok: true, folio: r.rows[0].folio, email_pospuesto: r.rows[0].email_pospuesto });
  } catch (err) {
    console.error('❌ posponerEmail error:', err);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
}

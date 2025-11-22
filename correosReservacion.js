// correosReservacion.js
import pool from './conexion.js';

/**
 * Normaliza un string de fecha tipo YYYY-MM-DD.
 * Si viene vacío o inválido, regresa null.
 */
function normalizarFecha(str) {
  if (!str) return null;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  // YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/correos-reservacion-error
 * Devuelve SOLO el número total de reservaciones cuyo email_reservacion
 * es distinto de 'enviado'.
 */
export async function contarCorreosReservacionError(req, res) {
  try {
    const sql = `
      SELECT COUNT(*) AS total
      FROM reservaciones
      WHERE COALESCE(LOWER(email_reservacion), '') <> 'enviado'
    `;
    const { rows } = await pool.query(sql);
    const total = Number(rows?.[0]?.total || 0);
    return res.json({ ok: true, total });
  } catch (err) {
    console.error('❌ contarCorreosReservacionError:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error al contar correos con estado distinto de enviado'
    });
  }
}

/**
 * GET /api/correos-reservacion-error/lista?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Lista las reservaciones cuyo email_reservacion es distinto de 'enviado'
 * en el rango de fechas indicado (fecha_reserva::date).
 * Si no se mandan desde/hasta, usa últimos 30 días.
 */
export async function listarCorreosReservacionError(req, res) {
  try {
    let { desde, hasta } = req.query;

    // Normalizar fechas
    let fHasta = normalizarFecha(hasta);
    let fDesde = normalizarFecha(desde);

    const hoy = new Date();

    if (!fHasta) {
      fHasta = hoy.toISOString().slice(0, 10); // hoy
    }

    if (!fDesde) {
      const d = new Date(fHasta);
      d.setDate(d.getDate() - 30); // últimos 30 días
      fDesde = d.toISOString().slice(0, 10);
    }

    const sql = `
      SELECT
        folio,
        nombre_cliente,
        fecha_reserva,
        email_reservacion
      FROM reservaciones
      WHERE COALESCE(LOWER(email_reservacion), '') <> 'enviado'
        AND fecha_reserva::date BETWEEN $1 AND $2
      ORDER BY fecha_reserva DESC
      LIMIT 500
    `;

    const { rows } = await pool.query(sql, [fDesde, fHasta]);

    return res.json({
      ok: true,
      desde: fDesde,
      hasta: fHasta,
      total: rows.length,
      datos: rows
    });
  } catch (err) {
    console.error('❌ listarCorreosReservacionError:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error al obtener lista de correos con estado distinto de enviado',
      datos: []
    });
  }
}

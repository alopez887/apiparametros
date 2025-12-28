// /posponeremail/correosReservacionPospuestos.js
import pool from '../conexion.js';

/**
 * Normaliza un string de fecha tipo YYYY-MM-DD.
 * Si viene vacío o inválido, regresa null.
 */
function normalizarFecha(str) {
  if (!str) return null;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * GET /api/correos-reservacion-error/pospuestos
 * Devuelve SOLO el número total de reservaciones cuyo email_reservacion
 * es distinto de 'enviado' Y que SÍ estén pospuestas (email_pospuesto = true).
 */
export async function contarCorreosPospuestos(req, res) {
  try {
    const sql = `
      SELECT COUNT(*) AS total
      FROM reservaciones
      WHERE COALESCE(LOWER(email_reservacion), '') <> 'enviado'
        AND COALESCE(email_pospuesto, false) = true
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

/**
 * GET /api/correos-reservacion-error/pospuestos/lista?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Lista las reservaciones cuyo email_reservacion es distinto de 'enviado'
 * en el rango de fechas indicado (fecha::date) y que SÍ estén pospuestas.
 * Si NO se mandan desde/hasta, NO se aplica filtro de fecha (lista global).
 */
export async function listarCorreosPospuestos(req, res) {
  try {
    const { desde, hasta } = req.query || {};

    // ✅ WHERE dinámico: no enviado + pospuesto=true
    let where = `
      COALESCE(LOWER(email_reservacion), '') <> 'enviado'
      AND COALESCE(email_pospuesto, false) = true
    `;
    const params = [];

    let outDesde = null;
    let outHasta = null;

    if (desde) {
      const fDesde = normalizarFecha(desde);
      if (fDesde) {
        outDesde = fDesde;
        params.push(fDesde);
        where += ` AND fecha::date >= $${params.length}`;
      }
    }

    if (hasta) {
      const fHasta = normalizarFecha(hasta);
      if (fHasta) {
        outHasta = fHasta;
        params.push(fHasta);
        where += ` AND fecha::date <= $${params.length}`;
      }
    }

    const sql = `
      SELECT
        folio,
        nombre_cliente,
        fecha,
        correo_cliente,
        email_reservacion,
        tipo_servicio,
        email_pospuesto
      FROM reservaciones
      WHERE ${where}
      ORDER BY fecha DESC
      LIMIT 500
    `;

    const { rows } = await pool.query(sql, params);

    return res.json({
      ok: true,
      desde: outDesde,
      hasta: outHasta,
      total: rows.length,
      datos: rows
    });
  } catch (err) {
    console.error('❌ listarCorreosPospuestos:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error al obtener lista de correos pospuestos',
      datos: []
    });
  }
}

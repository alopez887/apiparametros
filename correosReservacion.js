// correosReservacion.js
import pool from './conexion.js';

/**
 * GET /api/correos-reservacion-error
 * Devuelve solo el TOTAL de registros con email_reservacion ≠ 'enviado'
 */
export async function contarCorreosReservacionError(req, res, next) {
  try {
    const sql = `
      SELECT COUNT(*)::int AS total
      FROM reservaciones
      WHERE email_reservacion IS NOT NULL
        AND TRIM(email_reservacion) <> ''
        AND LOWER(email_reservacion) <> 'enviado'
    `;

    const { rows } = await pool.query(sql);
    const total = rows?.[0]?.total ?? 0;

    return res.json({
      ok: true,
      totalErrores: total
    });
  } catch (err) {
    console.error('Error en contarCorreosReservacionError:', err);
    return next(err);
  }
}

/**
 * GET /api/correos-reservacion-error/lista
 * Devuelve la LISTA de registros con email_reservacion ≠ 'enviado'
 * para alimentar el iframeMailnosend (folio, nombre, fecha, estatus, etc.)
 */
export async function listarCorreosReservacionError(req, res, next) {
  try {
    const sql = `
      SELECT
        id,
        folio,
        nombre_cliente,
        correo_cliente,
        fecha,                -- fecha de compra
        tipo_servicio,
        tipo_viaje,
        email_reservacion     -- estatus del correo
      FROM reservaciones
      WHERE email_reservacion IS NOT NULL
        AND TRIM(email_reservacion) <> ''
        AND LOWER(email_reservacion) <> 'enviado'
      ORDER BY fecha DESC, id DESC
    `;

    const { rows } = await pool.query(sql);

    return res.json({
      ok: true,
      total: rows.length,
      registros: rows
    });
  } catch (err) {
    console.error('Error en listarCorreosReservacionError:', err);
    return next(err);
  }
}

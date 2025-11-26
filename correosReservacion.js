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
 * en el rango de fechas indicado (fecha::date).
 * Si NO se mandan desde/hasta, NO se aplica filtro de fecha (lista global).
 */
export async function listarCorreosReservacionError(req, res) {
  try {
    const { desde, hasta } = req.query || {};

    // armamos WHERE dinámico
    let where  = `COALESCE(LOWER(email_reservacion), '') <> 'enviado'`;
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
        tipo_servicio
      FROM reservaciones
      WHERE ${where}
      ORDER BY fecha DESC
      LIMIT 500
    `;

    const { rows } = await pool.query(sql, params);

    return res.json({
      ok: true,
      // si no se mandó un límite, regresamos null
      desde: outDesde,
      hasta: outHasta,
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

/**
 * POST /api/correos-reservacion-error/actualizar-correo
 * Actualiza SOLO el correo del cliente (correo_cliente) para un folio.
 * Body esperado: { folio, correo }
 */
export async function actualizarCorreoCliente(req, res) {
  try {
    const { folio, correo } = req.body || {};

    if (!folio || !correo) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan parámetros: folio y correo son requeridos'
      });
    }

    // Validación básica de formato de correo
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(correo)) {
      return res.status(400).json({
        ok: false,
        error: 'Formato de correo inválido'
      });
    }

    const sql = `
      UPDATE reservaciones
      SET correo_cliente = $1
      WHERE folio = $2
      RETURNING folio, correo_cliente
    `;

    const { rows } = await pool.query(sql, [correo, folio]);

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        error: 'No se encontró una reservación con ese folio'
      });
    }

    return res.json({
      ok: true,
      mensaje: 'Correo actualizado correctamente',
      registro: rows[0]
    });
  } catch (err) {
    console.error('❌ actualizarCorreoCliente:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error al actualizar el correo del cliente'
    });
  }
}

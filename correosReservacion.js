// correosReservacion.js
import pool from './conexion.js';

const DBG = (...a) => {
  if (process.env.DEBUG_CORREOS) {
    console.log('[CORREOS-RESERVACION]', ...a);
  }
};

/**
 * GET /api/correos-reservacion-error
 * Devuelve solo el total de correos con email_reservacion distinto de 'enviado'
 * para poder pintar el badge 🔕 en los menús.
 */
export async function contarCorreosError(_req, res) {
  try {
    const sql = `
      SELECT COUNT(*) AS total
      FROM reservaciones
      WHERE email_reservacion IS NOT NULL
        AND LOWER(email_reservacion) <> 'enviado'
    `;
    const { rows } = await pool.query(sql);
    const total = Number(rows[0]?.total || 0);

    DBG('TOTAL ERRORES =', total);
    res.json({ ok: true, total });
  } catch (err) {
    console.error('💥 contarCorreosError:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
}

/**
 * GET /api/correos-reservacion-error/lista
 * Lista las reservaciones cuyo email_reservacion sea distinto de 'enviado'.
 * Opcional: filtrar por tipo_servicio = 'transporte' | 'tours'.
 *
 * NOTA: aquí YA NO filtramos por fecha; devolvemos todos los pendientes.
 */
export async function listarCorreosError(req, res) {
  try {
    const { servicio } = req.query; // 'transporte' | 'tours' | 'todos' | undefined

    const params = [];
    let where = `
      WHERE email_reservacion IS NOT NULL
        AND LOWER(email_reservacion) <> 'enviado'
    `;

    if (servicio && servicio !== 'todos') {
      params.push(servicio);
      where += ` AND tipo_servicio = $${params.length}`;
    }

    const sql = `
      SELECT
        folio,
        nombre_cliente,
        fecha,
        email_reservacion,
        tipo_servicio,
        tipo_viaje,
        correo_cliente
      FROM reservaciones
      ${where}
      ORDER BY fecha DESC
      LIMIT 500
    `;

    DBG('SQL LISTA =>', sql, 'PARAMS =>', params);
    const { rows } = await pool.query(sql, params);

    res.json({ ok: true, datos: rows });
  } catch (err) {
    console.error('💥 listarCorreosError:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
}

// partners/listarPartners.js
import pool from '../conexion.js';

/**
 * GET /api/partners
 * Query params:
 *   - page   (opcional, default 1)
 *   - limit  (opcional, default 10)
 *   - search (opcional, filtra por nombre)
 *
 * Respuesta:
 * {
 *   ok: true,
 *   rows: [...],
 *   total: number,
 *   page: number,
 *   totalPages: number
 * }
 */
export async function listarPartners(req, res) {
  let { page, limit, search } = req.query || {};
  let pageNum  = parseInt(page, 10);
  let pageSize = parseInt(limit, 10);

  if (!Number.isFinite(pageNum) || pageNum < 1) pageNum = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > 100) pageSize = 10;

  const offset = (pageNum - 1) * pageSize;
  const filtros = [];
  const params  = [];
  let idx       = 1;

  if (search && String(search).trim() !== '') {
    filtros.push(`LOWER(nombre) LIKE $${idx}`);
    params.push('%' + String(search).toLowerCase().trim() + '%');
    idx++;
  }

  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  try {
    // total
    const sqlCount = `
      SELECT COUNT(*) AS total
      FROM actividades_proveedores
      ${where}
    `;
    const { rows: countRows } = await pool.query(sqlCount, params);
    const total = Number(countRows?.[0]?.total || 0);

    if (!total) {
      return res.json({
        ok: true,
        rows: [],
        total: 0,
        page: 1,
        totalPages: 1
      });
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (pageNum > totalPages) pageNum = totalPages;

    const sqlList = `
      SELECT
        id,
        nombre,
        email_contacto,
        telefono_contacto,
        emails_cc,
        activo,
        created_at,
        updated_at
      FROM actividades_proveedores
      ${where}
      ORDER BY id ASC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    const listParams = [...params, pageSize, (pageNum - 1) * pageSize];
    const { rows } = await pool.query(sqlList, listParams);

    return res.json({
      ok: true,
      rows,
      total,
      page: pageNum,
      totalPages
    });
  } catch (err) {
    console.error('❌ listarPartners error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error al listar partners'
    });
  }
}

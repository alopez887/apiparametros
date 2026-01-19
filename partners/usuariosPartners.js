// partners/usuariosPartners.js
import pool from '../conexion.js';

/**
 * GET /api/partners/usuarios-partners
 *
 * Query params:
 *   - page         (opcional, default 1)
 *   - limit        (opcional, default 10, máx 100)
 *   - search       (opcional, filtra por nombre/usuario)
 *   - proveedor_id (opcional, filtra por partner específico)
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
export async function listarUsuariosPartners(req, res) {
  let { page, limit, search, proveedor_id } = req.query || {};

  let pageNum  = parseInt(page, 10);
  let pageSize = parseInt(limit, 10);

  if (!Number.isFinite(pageNum)  || pageNum < 1)        pageNum  = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1
      || pageSize > 100)                                 pageSize = 10;

  const offset = (pageNum - 1) * pageSize;

  const filters = [];
  const params  = [];

  // Filtro por proveedor_id (tab seleccionado)
  if (proveedor_id !== undefined && proveedor_id !== null && proveedor_id !== '') {
    const provIdNum = Number(proveedor_id);
    if (Number.isFinite(provIdNum)) {
      filters.push(`u.proveedor_id = $${params.length + 1}`);
      params.push(provIdNum);
    }
  }

  // Filtro por search (nombre o usuario)
  if (search && search.trim() !== '') {
    const term = `%${search.trim()}%`;
    filters.push(
      `(u.nombre ILIKE $${params.length + 1} OR u.usuario ILIKE $${params.length + 2})`
    );
    params.push(term, term);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const baseFrom = `
    FROM usuarios_actividades u
    LEFT JOIN actividades_proveedores p ON p.id = u.proveedor_id
  `;

  // Consulta principal (con paginación)
  const listSql = `
    SELECT
      u.id,
      u.usuario,
      u.nombre,
      u.proveedor_id,
      u.password,
      u.tipo_usuario,
      u.activo,
      p.nombre AS proveedor,
      TO_CHAR(u.created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
      TO_CHAR(u.updated_at, 'YYYY-MM-DD HH24:MI') AS updated_at
    ${baseFrom}
    ${whereClause}
    ORDER BY p.nombre, u.nombre
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  // Parámetros para listSql (filtros + limit + offset)
  const listParams = [...params, pageSize, offset];

  // Consulta para contar total
  const countSql = `
    SELECT COUNT(*) AS total
    ${baseFrom}
    ${whereClause}
  `;

  try {
    const client = await pool.connect();

    try {
      const [listResult, countResult] = await Promise.all([
        client.query(listSql, listParams),
        client.query(countSql, params) // ojo: sin limit/offset
      ]);

      const rows  = listResult.rows || [];
      const total = Number(countResult.rows?.[0]?.total || 0);
      const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

      return res.json({
        ok: true,
        rows,
        total,
        page: pageNum,
        totalPages
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ listarUsuariosPartners: error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error al listar usuarios de partners'
    });
  }
}

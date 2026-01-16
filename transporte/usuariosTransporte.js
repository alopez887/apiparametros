// registros/usuariosTransporte.js 
import pool from '../conexion.js';

export async function listarUsuariosTransporte(req, res) {
  const allowedTipos = ['representante', 'chofer', 'supervisor', 'administrador', 'sistemas'];

  try {
    let { tipo, page, limit, search } = req.query || {};

    // ---- tipo_usuario (pestaña) ----
    const tipoLower = String(tipo || 'representante').toLowerCase();
    const tipoFinal = allowedTipos.includes(tipoLower) ? tipoLower : 'representante';

    // ---- paginación ----
    let pageNum = parseInt(page, 10);
    if (Number.isNaN(pageNum) || pageNum < 1) pageNum = 1;

    let limitNum = parseInt(limit, 10);
    if (Number.isNaN(limitNum) || limitNum <= 0) limitNum = 10;
    if (limitNum > 50) limitNum = 50;

    const offset = (pageNum - 1) * limitNum;

    // ---- filtro de texto por nombre ----
    const term = (search || '').trim();
    let whereSql = 'WHERE tipo_usuario = $1';
    const paramsWhere = [tipoFinal];

    if (term) {
      // filtro case-insensitive por nombre
      whereSql += ` AND nombre ILIKE $2`;
      paramsWhere.push(`%${term}%`);
    }

    // ---- consulta de total ----
    const sqlCount = `
      SELECT COUNT(*) AS total
      FROM usuarios_proveedor
      ${whereSql}
    `;

    const { rows: countRows } = await pool.query(sqlCount, paramsWhere);
    const total = Number(countRows?.[0]?.total || 0);

    // ---- consulta de datos paginados ----
    const limitIndex  = paramsWhere.length + 1;
    const offsetIndex = paramsWhere.length + 2;

    const sqlData = `
      SELECT
        id,
        nombre,
        proveedor,
        usuario,
        password,
        tipo_usuario,
        activo,
        creado,
        modificado
      FROM usuarios_proveedor
      ${whereSql}
      ORDER BY nombre ASC
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
    `;

    const paramsData = [...paramsWhere, limitNum, offset];

    const { rows } = await pool.query(sqlData, paramsData);

    const pageSize   = limitNum;
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

    return res.json({
      ok: true,
      tipo_usuario: tipoFinal,
      page: pageNum,
      pageSize,
      total,
      totalPages,
      rows,
    });
  } catch (err) {
    console.error('❌ listarUsuariosTransporte error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error interno al listar usuarios de transporte',
    });
  }
}

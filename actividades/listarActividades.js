// actividades/listarActividades.js
import pool from '../conexion.js';

/**
 * Configuración por tipo de actividad:
 * - standard  -> public.tours
 * - duration  -> public.tourduracion
 * - pax       -> public.tour_pax
 * - combo     -> public.tours_combo
 */
function getConfigPorTipo(tipoRaw = 'standard') {
  const tipo = String(tipoRaw || '').toLowerCase();

  switch (tipo) {
    case 'duration':
      // 🔹 Tabla: public.tourduracion
      return {
        tipo: 'duration',
        table: 'public.tourduracion',
        codeCol: 'codigo',
        nameCol: 'nombre',
        // precios reales en la tabla
        colsPrecios: {
          // para mostrar en la tabla como "Base price"
          base: 'precio_adulto',
          normal: 'precionormal_adulto',
          opc: 'precioopc_adulto',
        },
        currencyCol: 'moneda',
        providerCol: 'proveedor',
        enabledCol: null,          // no hay habilitado → asumimos true
        orderBy: 'id ASC',
      };

    case 'pax':
      // 🔹 Tabla: public.tour_pax
      return {
        tipo: 'pax',
        table: 'public.tour_pax',
        codeCol: 'codigo',
        nameCol: 'actividad',
        colsPrecios: {
          base: 'precio',
          normal: 'precio_normal',
          opc: 'precioopc',
        },
        currencyCol: 'moneda',
        providerCol: 'proveedor',
        enabledCol: null,          // no hay habilitado → asumimos true
        orderBy: 'codigo ASC',
      };

    case 'combo':
      // 🔹 Tabla: public.tours_combo
      return {
        tipo: 'combo',
        table: 'public.tours_combo',
        codeCol: 'codigo',
        nameCol: 'nombre_combo',
        colsPrecios: {
          base: 'precio',
          normal: 'precio_normal',
          opc: 'precioopc',
        },
        currencyCol: 'moneda',
        providerCol: 'proveedor',
        enabledCol: 'habilitado',  // columna boolean
        orderBy: 'id ASC',
      };

    case 'standard':
    default:
      // 🔹 Tabla: public.tours
      return {
        tipo: 'standard',
        table: 'public.tours',
        codeCol: 'codigo',
        nameCol: 'nombre',
        // aquí tienes TODA la batería de precios
        colsPrecios: {
          base: 'precio_adulto',           // lo usamos como "Base price"
          normal: 'precionormal_adulto',
          opc: 'precioopc_adulto',
          adulto: 'precio_adulto',
          nino: 'precio_nino',
          normal_nino: 'precionormal_nino',
          opc_nino: 'precioopc_nino',
        },
        currencyCol: 'moneda',
        providerCol: 'proveedor',
        enabledCol: null,                  // si luego agregas columna, la usamos
        orderBy: 'id ASC',
      };
  }
}

export async function listarActividades(req, res) {
  try {
    const {
      tipo = 'standard',
      search = '',
      proveedor = 'all',
      page = '1',
      pageSize = '10',
    } = req.query;

    const cfg = getConfigPorTipo(tipo);
    if (!cfg) {
      return res.status(400).json({
        ok: false,
        msg: 'Tipo de actividad inválido',
      });
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNum = Math.min(Math.max(parseInt(pageSize, 10) || 10, 1), 100);

    const filtrosParams = [];
    let where = 'WHERE 1=1';

    // 🔍 Filtro por búsqueda (nombre o código)
    if (search && search.trim()) {
      filtrosParams.push(`%${search.trim()}%`);
      const idx = filtrosParams.length;
      where += ` AND (${cfg.nameCol} ILIKE $${idx} OR ${cfg.codeCol} ILIKE $${idx})`;
    }

    // 🔍 Filtro por proveedor
    if (proveedor && proveedor !== 'all') {
      filtrosParams.push(proveedor);
      const idx = filtrosParams.length;
      where += ` AND ${cfg.providerCol} = $${idx}`;
    }

    // ===== TOTAL PARA PAGINACIÓN =====
    const countSql = `
      SELECT COUNT(*) AS total
      FROM ${cfg.table}
      ${where};
    `;
    const { rows: countRows } = await pool.query(countSql, filtrosParams);
    const total = Number(countRows[0]?.total || 0);

    // ===== LISTA PÁGINA ACTUAL =====
    const offset = (pageNum - 1) * sizeNum;
    const listParams = [...filtrosParams, sizeNum, offset];
    const limitIndex = filtrosParams.length + 1;
    const offsetIndex = filtrosParams.length + 2;

    // armamos los SELECT de precios según lo que exista para ese tipo
    const p = cfg.colsPrecios || {};
    const selectPrecioBase   = p.base   ? `${p.base}   AS precio`          : 'NULL AS precio';
    const selectPrecioNormal = p.normal ? `${p.normal} AS precio_normal`   : 'NULL AS precio_normal';
    const selectPrecioOpc    = p.op     ? `${p.op}     AS precioopc`       : 'NULL AS precioopc';
    const selectPrecioAdulto = p.adulto ? `${p.adulto} AS precio_adulto`   : 'NULL AS precio_adulto';
    const selectPrecioNino   = p.nino   ? `${p.nino}   AS precio_nino`     : 'NULL AS precio_nino';
    const selectPNormalNino  = p.normal_nino ? `${p.normal_nino} AS precionormal_nino` : 'NULL AS precionormal_nino';
    const selectPOpcNino     = p.op_nino ? `${p.op_nino} AS precioopc_nino` : 'NULL AS precioopc_nino';

    const listSql = `
      SELECT
        ${cfg.codeCol}     AS codigo,
        ${cfg.nameCol}     AS nombre,
        ${cfg.currencyCol} AS moneda,
        ${cfg.providerCol} AS proveedor,
        ${cfg.enabledCol ? cfg.enabledCol : 'TRUE'} AS habilitado,
        ${selectPrecioBase},
        ${selectPrecioNormal},
        ${selectPrecioOpc},
        ${selectPrecioAdulto},
        ${selectPrecioNino},
        ${selectPNormalNino},
        ${selectPOpcNino}
      FROM ${cfg.table}
      ${where}
      ORDER BY ${cfg.orderBy}
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex};
    `;

    const { rows } = await pool.query(listSql, listParams);

    // 👉 El front ya usa r.precio y r.moneda para la columna "Base price",
    // pero ahora también tendrá:
    // - precio_normal
    // - precioopc
    // - precio_adulto / precio_nino (para standard)
    // - etc., según la tabla.

    return res.json({
      ok: true,
      tipo: cfg.tipo,
      total,
      page: pageNum,
      pageSize: sizeNum,
      data: rows,
    });
  } catch (error) {
    console.error('❌ listarActividades: error:', error);
    return res.status(500).json({
      ok: false,
      msg: 'Error al listar actividades',
    });
  }
}

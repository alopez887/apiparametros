// /actividades/actividadcombo/listarActividadesCombo.js
import pool from '../../conexion.js';

/**
 * GET /api/combos/listar
 * GET /api/combos/listar?q=CACTUS
 *
 * Estructura devuelta por fila:
 * {
 *   id, codigo, nombre_combo, nombre_combo_es, proveedor,
 *   precio, precio_normal, precioopc, moneda, estatus,
 *   created_at, updated_at,
 *   cantidad_actividades, actividades_en[], actividades_es[]
 * }
 */
export async function listarActividadesCombo(req, res) {
  try {
    const q = (req.query?.q || '').trim();
    const params = [];
    let where = '';

    if (q) {
      params.push(`%${q}%`);
      where = `
        WHERE
          c.codigo ILIKE $1 OR
          c.nombre_combo ILIKE $1 OR
          c.nombre_combo_es ILIKE $1 OR
          c.proveedor ILIKE $1
      `;
    }

    // Nota: LATERAL permite calcular los agregados por cada combo
    const sql = `
      SELECT
        c.id,
        c.codigo,
        c.nombre_combo,
        c.nombre_combo_es,
        c.proveedor,
        c.precio,
        c.precio_normal,
        c.precioopc,
        c.moneda,
        c.estatus,
        c.created_at,
        c.updated_at,
        COALESCE(a.cantidad, 0)                         AS cantidad_actividades,
        COALESCE(a.actividades_en, ARRAY[]::text[])     AS actividades_en,
        COALESCE(a.actividades_es, ARRAY[]::text[])     AS actividades_es
      FROM public.tours_combo AS c
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS cantidad,
          ARRAY_AGG(tca.actividad ORDER BY tca.actividad)         AS actividades_en,
          ARRAY_AGG(tca.actividad_es ORDER BY tca.actividad_es)   AS actividades_es
        FROM public.tours_comboact AS tca
        WHERE
          tca.proveedor = c.proveedor
          AND tca.habilitado = TRUE
      ) AS a ON TRUE
      ${where}
      ORDER BY c.id ASC
    `;

    const { rows } = await pool.query(sql, params);

    return res.json({
      ok: true,
      data: rows,
    });
  } catch (err) {
    console.error('❌ listarActividadesCombo:', err);
    return res.status(500).json({
      ok: false,
      error: 'No se pudieron listar los combos',
    });
  }
}

// actividades/actividadcombo/listarActividadesCombo.js
import pool from '../../conexion.js';

/**
 * GET /api/combos/listar
 * GET /api/combos/listar?q=CACTUS
 *
 * Devuelve por fila:
 * {
 *   id, codigo, nombre_combo, nombre_combo_es, proveedor,
 *   precio, precio_normal, precioopc, moneda, estatus,
 *   created_at, updated_at,
 *   cantidad_actividades,          // ✅ lo que podrá elegir el cliente (2,3,5)
 *   total_catalogo,                // 🔎 cuántas hay en la lista (opcional)
 *   actividades_en[], actividades_es[]
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

        -- ✅ valor de negocio: cuántas podrá elegir el cliente
        c.cantidad_actividades AS cantidad_actividades,

        -- 🔎 informativo: cuántas actividades hay cargadas en la lista
        COALESCE(a.total_catalogo, 0)                    AS total_catalogo,
        COALESCE(a.actividades_en, ARRAY[]::text[])      AS actividades_en,
        COALESCE(a.actividades_es, ARRAY[]::text[])      AS actividades_es

      FROM public.tours_combo AS c
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS total_catalogo,
          ARRAY_REMOVE(ARRAY_AGG(tca.actividad ORDER BY tca.actividad), NULL)     AS actividades_en,
          ARRAY_REMOVE(ARRAY_AGG(tca.actividad_es ORDER BY tca.actividad_es), NULL) AS actividades_es
        FROM public.tours_comboact AS tca
        -- 👇 Relación correcta con el combo
        WHERE tca.id_relacionado = c.id
      ) AS a ON TRUE
      ${where}
      ORDER BY c.id ASC
    `;

    const { rows } = await pool.query(sql, params);
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('❌ listarActividadesCombo:', err);
    return res.status(500).json({ ok: false, error: 'No se pudieron listar los combos' });
  }
}

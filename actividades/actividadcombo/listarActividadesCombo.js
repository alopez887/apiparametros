// actividades/actividadcombo/listarActividadesCombo.js
import pool from '../../conexion.js';

/**
 * GET /api/combos/listar
 * GET /api/combos/listar?q=CACTUS
 *
 * Devuelve por fila:
 *  id, codigo, nombre_combo, nombre_combo_es, proveedor, precio, precio_normal,
 *  precioopc, moneda, estatus, created_at, updated_at, cantidad_actividades,
 *  total_catalogo, actividades_en[], actividades_es[], id_relacionado
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

    // VERSION para columnas text[]: unnest para volver a escalares y luego filtrar/ordenar
    const sql = `
      SELECT
        c.id,
        c.codigo,
        c.nombre_combo,
        c.nombre_combo_es,
        c.proveedor,                      -- proveedor EXACTO del registro
        c.precio,
        c.precio_normal,
        c.precioopc,
        c.moneda,
        c.estatus,
        c.created_at,
        c.updated_at,
        c.cantidad_actividades AS cantidad_actividades,
        c.id_relacionado,

        COALESCE(a.total_catalogo, 0)               AS total_catalogo,
        COALESCE(a.actividades_en, ARRAY[]::text[]) AS actividades_en,
        COALESCE(a.actividades_es, ARRAY[]::text[]) AS actividades_es

      FROM public.tours_combo AS c

      LEFT JOIN LATERAL (
        SELECT
          /* número de filas (registros) en el catálogo */
          (
            SELECT COUNT(*)::int
            FROM public.tours_comboact tca2
            WHERE tca2.id_relacionado = c.id_relacionado
              AND (tca2.estatus IS TRUE OR tca2.estatus = 't')
          ) AS total_catalogo,

          /* actividades EN (desdoblando text[]) */
          COALESCE(
            (
              SELECT ARRAY_AGG(v ORDER BY v)
              FROM (
                SELECT UNNEST(tca3.actividad) AS v
                FROM public.tours_comboact tca3
                WHERE tca3.id_relacionado = c.id_relacionado
                  AND (tca3.estatus IS TRUE OR tca3.estatus = 't')
              ) u1
              WHERE v IS NOT NULL AND v <> ''                -- ← filtra vacíos ya como TEXT
            ),
            ARRAY[]::text[]
          ) AS actividades_en,

          /* actividades ES (desdoblando text[]) */
          COALESCE(
            (
              SELECT ARRAY_AGG(v2 ORDER BY v2)
              FROM (
                SELECT UNNEST(tca4.actividad_es) AS v2
                FROM public.tours_comboact tca4
                WHERE tca4.id_relacionado = c.id_relacionado
                  AND (tca4.estatus IS TRUE OR tca4.estatus = 't')
              ) u2
              WHERE v2 IS NOT NULL AND v2 <> ''
            ),
            ARRAY[]::text[]
          ) AS actividades_es
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

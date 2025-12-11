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

    const sql = `
      SELECT
        c.id,
        c.codigo,
        c.nombre_combo,
        c.nombre_combo_es,
        c.proveedor,                      -- proveedor EXACTO del registro (no se toca)
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

      -- ===== SUBQUERY LATERAL =====
      -- VERSIÓN A: columnas actividad / actividad_es son TEXT (no arrays)
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS total_catalogo,
          COALESCE(
            ARRAY_AGG(tca.actividad ORDER BY tca.actividad)
              FILTER (WHERE tca.actividad IS NOT NULL AND TRIM(tca.actividad) <> ''),
            ARRAY[]::text[]
          ) AS actividades_en,
          COALESCE(
            ARRAY_AGG(tca.actividad_es ORDER BY tca.actividad_es)
              FILTER (WHERE tca.actividad_es IS NOT NULL AND TRIM(tca.actividad_es) <> ''),
            ARRAY[]::text[]
          ) AS actividades_es
        FROM public.tours_comboact AS tca
        WHERE tca.id_relacionado = c.id_relacionado
          AND (tca.estatus IS TRUE OR tca.estatus = 't')
      ) AS a ON TRUE

      /* 
      -- VERSIÓN B (usar SOLO si actividad/actividad_es son TEXT[] en la tabla):
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS total_catalogo,
          COALESCE(
            ARRAY_AGG(val_en ORDER BY val_en)
              FILTER (WHERE val_en IS NOT NULL AND TRIM(val_en) <> ''),
            ARRAY[]::text[]
          ) AS actividades_en,
          COALESCE(
            ARRAY_AGG(val_es ORDER BY val_es)
              FILTER (WHERE val_es IS NOT NULL AND TRIM(val_es) <> ''),
            ARRAY[]::text[]
          ) AS actividades_es
        FROM (
          SELECT
            UNNEST(tca.actividad)    AS val_en,
            UNNEST(tca.actividad_es) AS val_es
          FROM public.tours_comboact tca
          WHERE tca.id_relacionado = c.id_relacionado
            AND (tca.estatus IS TRUE OR tca.estatus = 't')
        ) u
      ) AS a ON TRUE
      */

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

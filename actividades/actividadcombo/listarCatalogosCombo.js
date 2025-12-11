// /actividades/actividadcombo/listarCatalogosCombo.js
import pool from '../../conexion.js';

/**
 * GET /api/catalogos-combo
 * Respuesta por fila:
 * { id_relacionado, proveedor, total_actividades }
 */
export async function listarCatalogosCombo(_req, res) {
  try {
    const sql = `
      WITH prov AS (
        /* proveedor NO vacío más reciente por catálogo (desde tours_combo) */
        SELECT DISTINCT ON (c.id_relacionado)
               c.id_relacionado,
               NULLIF(TRIM(c.proveedor),'') AS proveedor
        FROM public.tours_combo c
        WHERE c.id_relacionado IS NOT NULL
          AND NULLIF(TRIM(c.proveedor),'') IS NOT NULL
        ORDER BY c.id_relacionado, c.updated_at DESC, c.id DESC
      ),
      acts AS (
        /* conteo de actividades activas por catálogo (tours_comboact) */
        SELECT tca.id_relacionado,
               COUNT(*)::int AS total_actividades
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
          AND (tca.estatus IS TRUE OR tca.estatus = 't')
        GROUP BY tca.id_relacionado
      ),
      cats AS (
        /* universo de catálogos detectados en ambas tablas */
        SELECT DISTINCT id_relacionado
        FROM public.tours_combo
        WHERE id_relacionado IS NOT NULL
        UNION
        SELECT DISTINCT id_relacionado
        FROM public.tours_comboact
        WHERE id_relacionado IS NOT NULL
      )
      SELECT
        cats.id_relacionado,
        COALESCE(prov.proveedor, '') AS proveedor,
        COALESCE(acts.total_actividades, 0) AS total_actividades
      FROM cats
      LEFT JOIN prov USING (id_relacionado)
      LEFT JOIN acts USING (id_relacionado)
      ORDER BY cats.id_relacionado;
    `;

    const { rows } = await pool.query(sql);
    return res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('❌ /api/catalogos-combo:', e);
    return res.status(500).json({ ok: false, error: 'No se pudieron listar los catálogos de combos' });
  }
}

/**
 * GET /api/catalogos-combo/:id/items
 * Devuelve nombres ES/EN de actividades del catálogo (sólo activas),
 * ordenados por el nombre visible.
 *
 * NOTA: si en tu esquema actividad/actividad_es fueran text[],
 * usa UNNEST; si son text plano, este SELECT ya sirve.
 */
export async function listarItemsDeCatalogo(req, res) {
  try {
    const id = String(req.params.id || req.query.id || '').trim();
    if (!id) return res.json({ ok: true, data: [] });

    const sql = `
      SELECT
        NULLIF(TRIM(tca.actividad_es), '') AS actividad_es,
        NULLIF(TRIM(tca.actividad),    '') AS actividad_en
      FROM public.tours_comboact tca
      WHERE tca.id_relacionado = $1
        AND (tca.estatus IS TRUE OR tca.estatus = 't')
      ORDER BY COALESCE(NULLIF(TRIM(tca.actividad_es), ''), NULLIF(TRIM(tca.actividad), '')) ASC
    `;
    const { rows } = await pool.query(sql, [id]);

    const data = rows.map(x => ({
      actividad_es: x.actividad_es || null,
      actividad:    x.actividad_en || null
    }));

    return res.json({ ok: true, data });
  } catch (e) {
    console.error('❌ /api/catalogos-combo/:id/items:', e);
    return res.status(500).json({ ok: false, error: 'No se pudieron listar las actividades del catálogo' });
  }
}

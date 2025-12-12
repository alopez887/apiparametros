// /actividades/actividadcombo/listarCatalogosCombo.js
import pool from '../../conexion.js';

/**
 * GET /api/catalogos-combo
 * Respuesta por fila:
 * {
 *   id_relacionado,
 *   proveedor,
 *   total_actividades,
 *   created_at,
 *   updated_at
 * }
 */
export async function listarCatalogosCombo(_req, res) {
  try {
    const sql = `
      WITH cats AS (
        /* ✅ universo de catálogos: SOLO tours_comboact (catálogo vive aquí) */
        SELECT DISTINCT tca.id_relacionado
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
          AND (tca.estatus IS TRUE OR tca.estatus = 't')
      ),
      prov AS (
        /* ✅ proveedor NO vacío más reciente por catálogo (DESDE tours_comboact) */
        SELECT DISTINCT ON (tca.id_relacionado)
               tca.id_relacionado,
               NULLIF(BTRIM(tca.proveedor), '') AS proveedor
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
          AND (tca.estatus IS TRUE OR tca.estatus = 't')
          AND NULLIF(BTRIM(tca.proveedor), '') IS NOT NULL
        ORDER BY tca.id_relacionado, tca.updated_at DESC, tca.id DESC
      ),
      acts AS (
        /* Conteo REAL de actividades por catálogo (elementos del arreglo actividad) */
        SELECT
          tca.id_relacionado,
          SUM(
            COALESCE(
              (SELECT COUNT(*)
                 FROM unnest(COALESCE(tca.actividad, '{}'::text[])) v
                WHERE v IS NOT NULL AND v <> ''),
              0
            )
          )::int AS total_actividades
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
          AND (tca.estatus IS TRUE OR tca.estatus = 't')
        GROUP BY tca.id_relacionado
      ),
      dates AS (
        /* ✅ Fechas SOLO del catálogo (tours_comboact) */
        SELECT
          tca.id_relacionado,
          MIN(tca.created_at) AS created_at,
          MAX(tca.updated_at) AS updated_at
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
          AND (tca.estatus IS TRUE OR tca.estatus = 't')
        GROUP BY tca.id_relacionado
      )
      SELECT
        cats.id_relacionado,
        COALESCE(prov.proveedor, '') AS proveedor,
        COALESCE(acts.total_actividades, 0) AS total_actividades,
        dates.created_at,
        dates.updated_at
      FROM cats
      LEFT JOIN prov  USING (id_relacionado)
      LEFT JOIN acts  USING (id_relacionado)
      LEFT JOIN dates USING (id_relacionado)
      ORDER BY cats.id_relacionado;
    `;

    const { rows } = await pool.query(sql);
    return res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('❌ /api/catalogos-combo:', e);
    return res.status(500).json({
      ok: false,
      error: 'No se pudieron listar los catálogos de combos'
    });
  }
}

/**
 * GET /api/catalogos-combo/:id/items
 * Devuelve nombres ES/EN de actividades del catálogo (sólo activas),
 * ordenados por el nombre visible.
 *
 * NOTA: actividad y actividad_es son text[] → se hace UNNEST con ORDINALITY
 * para alinear por posición.
 */
export async function listarItemsDeCatalogo(req, res) {
  try {
    const id = String(req.params.id || req.query.id || '').trim();
    if (!id) return res.json({ ok: true, data: [] });

    const sql = `
      WITH base AS (
        SELECT
          tca.id_relacionado,
          en.eng AS actividad_en,
          es.esp AS actividad_es
        FROM public.tours_comboact tca
        LEFT JOIN LATERAL unnest(COALESCE(tca.actividad,    '{}'::text[]))
             WITH ORDINALITY AS en(eng, ord) ON TRUE
        LEFT JOIN LATERAL unnest(COALESCE(tca.actividad_es, '{}'::text[]))
             WITH ORDINALITY AS es(esp, ord) ON es.ord = en.ord
        WHERE tca.id_relacionado = $1
          AND (tca.estatus IS TRUE OR tca.estatus = 't')
      )
      SELECT
        NULLIF(TRIM(actividad_es), '') AS actividad_es,
        NULLIF(TRIM(actividad_en), '') AS actividad_en
      FROM base
      WHERE COALESCE(NULLIF(TRIM(actividad_es), ''), NULLIF(TRIM(actividad_en), '')) IS NOT NULL
      ORDER BY COALESCE(NULLIF(TRIM(actividad_es), ''), NULLIF(TRIM(actividad_en), '')) ASC;
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

// /actividades/actividadcombo/listarCatalogosCombo.js
import pool from '../../conexion.js';

/**
 * GET /api/catalogos-combo
 * Respuesta por fila:
 * {
 *   id_relacionado,
 *   proveedor,
 *   total_actividades,
 *   estatus,       // ✅ agregado: true/false (estatus más reciente del catálogo)
 *   created_at,
 *   updated_at
 * }
 *
 * ✅ IMPORTANTE: NO se filtra por estatus. Deben verse TODOS los catálogos.
 */
export async function listarCatalogosCombo(_req, res) {
  try {
    const sql = `
      WITH cats AS (
        /* universo de catálogos: tours_comboact (catálogo vive aquí) */
        SELECT DISTINCT tca.id_relacionado
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
      ),
      prov AS (
        /* proveedor NO vacío (más reciente por catálogo) */
        SELECT DISTINCT ON (tca.id_relacionado)
               tca.id_relacionado,
               NULLIF(BTRIM(tca.proveedor), '') AS proveedor
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
          AND NULLIF(BTRIM(tca.proveedor), '') IS NOT NULL
        ORDER BY tca.id_relacionado, tca.updated_at DESC, tca.id DESC
      ),
      st AS (
        /* ✅ estatus más reciente por catálogo */
        SELECT DISTINCT ON (tca.id_relacionado)
               tca.id_relacionado,
               COALESCE(tca.estatus, true) AS estatus
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
        ORDER BY tca.id_relacionado, tca.updated_at DESC, tca.id DESC
      ),
      acts AS (
        /* total de actividades (conteo robusto de arrays por fila, sumado por catálogo) */
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
        GROUP BY tca.id_relacionado
      ),
      dates AS (
        /* fechas del catálogo */
        SELECT
          tca.id_relacionado,
          MIN(tca.created_at) AS created_at,
          MAX(tca.updated_at) AS updated_at
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
        GROUP BY tca.id_relacionado
      )
      SELECT
        cats.id_relacionado,
        COALESCE(prov.proveedor, '') AS proveedor,
        COALESCE(acts.total_actividades, 0) AS total_actividades,
        COALESCE(st.estatus, true) AS estatus,
        dates.created_at,
        dates.updated_at
      FROM cats
      LEFT JOIN prov  USING (id_relacionado)
      LEFT JOIN st    USING (id_relacionado)
      LEFT JOIN acts  USING (id_relacionado)
      LEFT JOIN dates USING (id_relacionado)
      ORDER BY cats.id_relacionado;
    `;

    const { rows } = await pool.query(sql);
    return res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('❌ listarCatalogosCombo error:', e);
    return res.status(500).json({
      ok: false,
      error: 'No se pudieron listar los catálogos'
    });
  }
}

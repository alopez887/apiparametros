// /actividades/actividadcombo/listarCatalogosCombo.js
import pool from '../../conexion.js';

/**
 * GET /api/catalogos-combo
 * Respuesta por fila (DEFAULT, SIN CAMBIOS):
 * {
 *   id_relacionado,
 *   proveedor,
 *   total_actividades,
 *   created_at,
 *   updated_at
 * }
 *
 * Si se manda ?with_status=1 => agrega:
 *   estatus
 *
 * ✅ IMPORTANTE: NO se filtra por estatus. Deben verse TODOS los catálogos.
 */
export async function listarCatalogosCombo(req, res) {
  try {
    const withStatusRaw = String(req.query.with_status || req.query.withStatus || '')
      .trim()
      .toLowerCase();
    const wantStatus = (withStatusRaw === '1' || withStatusRaw === 'true' || withStatusRaw === 'yes');

    const sql = `
      WITH cats AS (
        /* universo de catálogos: tours_comboact (catálogo vive aquí) */
        SELECT DISTINCT tca.id_relacionado
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
      ),
      prov AS (
        /* proveedor NO vacío más reciente por catálogo (desde tours_comboact) */
        SELECT DISTINCT ON (tca.id_relacionado)
               tca.id_relacionado,
               NULLIF(BTRIM(tca.proveedor), '') AS proveedor
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
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
        GROUP BY tca.id_relacionado
      ),
      dates AS (
        /* Fechas del catálogo (tours_comboact) */
        SELECT
          tca.id_relacionado,
          MIN(tca.created_at) AS created_at,
          MAX(tca.updated_at) AS updated_at
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
        GROUP BY tca.id_relacionado
      )
      ${wantStatus ? `
      , stat AS (
        /* Estatus agregado por catálogo (si existe en tours_comboact) */
        SELECT
          tca.id_relacionado,
          BOOL_AND(COALESCE(tca.estatus, true)) AS estatus
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
        GROUP BY tca.id_relacionado
      )
      ` : ``}
      SELECT
        cats.id_relacionado,
        COALESCE(prov.proveedor, '') AS proveedor,
        COALESCE(acts.total_actividades, 0) AS total_actividades,
        dates.created_at,
        dates.updated_at
        ${wantStatus ? `, COALESCE(stat.estatus, true) AS estatus` : ``}
      FROM cats
      LEFT JOIN prov  USING (id_relacionado)
      LEFT JOIN acts  USING (id_relacionado)
      LEFT JOIN dates USING (id_relacionado)
      ${wantStatus ? `LEFT JOIN stat USING (id_relacionado)` : ``}
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

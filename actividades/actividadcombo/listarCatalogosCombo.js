// ./actividades/actividadcombo/listarCatalogosCombo.js
import pool from '../../conexion.js';

/**
 * GET /api/catalogos-combo
 * Devuelve por fila:
 * {
 *   id_relacionado,
 *   proveedor,
 *   total_actividades,
 *   created_at,
 *   updated_at,
 *   estatus
 * }
 *
 * ✅ IMPORTANTE: NO se filtra por estatus. Deben verse TODOS los catálogos.
 * ✅ Se incluye estatus (boolean) para que el iframe pinte Activar/Desactivar con el valor REAL.
 */
export async function listarCatalogosCombo(_req, res) {
  try {
    const sql = `
      WITH base AS (
        SELECT
          tca.id_relacionado,
          tca.proveedor,
          tca.actividad,
          tca.actividad_es,
          tca.created_at,
          tca.updated_at,
          tca.estatus
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
      )
      SELECT
        b.id_relacionado,
        COALESCE(
          MIN(NULLIF(BTRIM(b.proveedor), '')) FILTER (WHERE NULLIF(BTRIM(b.proveedor), '') IS NOT NULL),
          ''
        ) AS proveedor,
        COUNT(*)::int AS total_actividades,
        MIN(b.created_at) AS created_at,
        MAX(b.updated_at) AS updated_at,
        BOOL_AND(COALESCE(b.estatus, TRUE)) AS estatus
      FROM base b
      GROUP BY b.id_relacionado
      ORDER BY
        CASE
          WHEN (b.id_relacionado::text ~ '^[0-9]+$') THEN (b.id_relacionado::text)::int
          ELSE NULL
        END NULLS LAST,
        b.id_relacionado::text ASC
    `;

    const { rows } = await pool.query(sql);
    return res.json({ data: rows });
  } catch (err) {
    console.error('listarCatalogosCombo error:', err);
    return res.status(500).json({ error: 'Error al listar catálogos combo' });
  }
}

/**
 * GET /api/catalogos-combo/:id/items
 * Devuelve los items (actividades) del catálogo.
 */
export async function listarItemsDeCatalogo(req, res) {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id requerido' });

    const sql = `
      SELECT
        id_relacionado,
        proveedor,
        actividad,
        actividad_es,
        created_at,
        updated_at,
        estatus
      FROM public.tours_comboact
      WHERE id_relacionado = $1
      ORDER BY actividad ASC NULLS LAST, actividad_es ASC NULLS LAST
    `;

    const { rows } = await pool.query(sql, [id]);
    return res.json({ data: rows });
  } catch (err) {
    console.error('listarItemsDeCatalogo error:', err);
    return res.status(500).json({ error: 'Error al listar items del catálogo' });
  }
}

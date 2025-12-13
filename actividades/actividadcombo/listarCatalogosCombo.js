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
      agg AS (
        /* agregados por catálogo */
        SELECT
          tca.id_relacionado,
          COUNT(*)::int AS total_actividades,
          MIN(tca.created_at) AS created_at,
          MAX(COALESCE(tca.updated_at, tca.created_at)) AS updated_at
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
        GROUP BY tca.id_relacionado
      ),
      prov AS (
        /* proveedor real (no inventado): toma el más reciente no vacío por catálogo */
        SELECT DISTINCT ON (tca.id_relacionado)
          tca.id_relacionado,
          NULLIF(BTRIM(tca.proveedor), '') AS proveedor
        FROM public.tours_comboact tca
        WHERE tca.id_relacionado IS NOT NULL
          AND NULLIF(BTRIM(tca.proveedor), '') IS NOT NULL
        ORDER BY
          tca.id_relacionado,
          COALESCE(tca.updated_at, tca.created_at) DESC NULLS LAST,
          tca.id DESC
      )
      SELECT
        c.id_relacionado,
        COALESCE(p.proveedor, '') AS proveedor,
        COALESCE(a.total_actividades, 0) AS total_actividades,
        a.created_at,
        a.updated_at
      FROM cats c
      LEFT JOIN agg  a ON a.id_relacionado = c.id_relacionado
      LEFT JOIN prov p ON p.id_relacionado = c.id_relacionado
      ORDER BY a.updated_at DESC NULLS LAST, c.id_relacionado DESC;
    `;

    const { rows } = await pool.query(sql);
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('listarCatalogosCombo error:', err);
    return res.status(500).json({ ok: false, error: 'Error al listar catálogos combo' });
  }
}

/**
 * GET /api/catalogos-combo/items?id_relacionado=XYZ
 * (o id=XYZ)
 *
 * Devuelve actividades dentro del catálogo.
 * No filtra por estatus (muestra todo lo que exista en DB para ese catálogo).
 */
export async function listarItemsDeCatalogo(req, res) {
  try {
    const idRel = String(
      req.query.id_relacionado ?? req.query.id ?? req.params?.id_relacionado ?? ''
    ).trim();

    if (!idRel) {
      return res.status(400).json({ ok: false, error: 'Falta id_relacionado' });
    }

    const sql = `
      SELECT
        tca.id,
        tca.id_relacionado,
        tca.proveedor,
        tca.actividad,
        tca.actividad_es,
        tca.created_at,
        tca.updated_at
      FROM public.tours_comboact tca
      WHERE tca.id_relacionado = $1
      ORDER BY COALESCE(tca.updated_at, tca.created_at) DESC NULLS LAST, tca.id DESC;
    `;

    const { rows } = await pool.query(sql, [idRel]);
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('listarItemsDeCatalogo error:', err);
    return res.status(500).json({ ok: false, error: 'Error al listar items del catálogo' });
  }
}

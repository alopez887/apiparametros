// /actividades/actividadcombo/listarCatalogosCombo.js
import pool from '../../conexion.js'; // conexion.js está en la raíz

export async function listarCatalogosCombo(req, res) {
  try {
    const sql = `
      WITH base AS (
        SELECT id_relacionado, proveedor
        FROM public.tours_combo
        WHERE id_relacionado IS NOT NULL
        UNION ALL
        SELECT id_relacionado, proveedor
        FROM public.tours_comboact
        WHERE id_relacionado IS NOT NULL
      ),
      cats AS (
        SELECT id_relacionado,
               MIN(NULLIF(TRIM(proveedor), '')) AS proveedor
        FROM base
        GROUP BY id_relacionado
      ),
      acts AS (
        SELECT id_relacionado, COUNT(*)::int AS n_acts
        FROM public.tours_comboact
        WHERE id_relacionado IS NOT NULL
        GROUP BY id_relacionado
      )
      SELECT c.id_relacionado,
             c.proveedor,
             COALESCE(a.n_acts, 0) AS total_actividades
      FROM cats c
      LEFT JOIN acts a USING (id_relacionado)
      ORDER BY c.id_relacionado;
    `;
    const r = await pool.query(sql);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    console.error('listarCatalogosCombo', e);
    res.status(500).json({ ok: false, error: 'No se pudieron listar catálogos' });
  }
}

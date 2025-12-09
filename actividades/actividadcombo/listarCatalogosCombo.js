// /actividades/actividadcombo/listarCatalogosCombo.js
import pool from '../../conexion.js'; 

export async function listarCatalogosCombo(_req, res) {
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

// ✅ NUEVO: items (actividades) de un catálogo
export async function listarItemsDeCatalogo(req, res) {
  try {
    const id = String(req.params.id || req.query.id || '').trim();
    if (!id) return res.json({ ok: true, data: [] });

    const sql = `
      SELECT
        NULLIF(TRIM(actividad_es), '') AS actividad_es,
        NULLIF(TRIM(actividad),    '') AS actividad_en
      FROM public.tours_comboact
      WHERE id_relacionado = $1
      ORDER BY COALESCE(NULLIF(TRIM(actividad_es), ''), NULLIF(TRIM(actividad), '')) ASC;
    `;
    const r = await pool.query(sql, [id]);

    const data = r.rows.map(x => ({
      actividad_es: x.actividad_es || null,
      actividad:    x.actividad_en || null
    }));

    res.json({ ok: true, data });
  } catch (e) {
    console.error('listarItemsDeCatalogo', e);
    res.status(500).json({ ok: false, error: 'No se pudieron listar las actividades del catálogo' });
  }
}

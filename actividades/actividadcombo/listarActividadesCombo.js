import pool from '../../conexion.js';

// GET /api/catalogos-combo
export async function listarCatalogosCombo(req, res) {
  try {
    const sql = `
      SELECT
        c.id_relacionado,
        -- proveedor del registro más reciente y no vacío dentro del catálogo
        (ARRAY_REMOVE(
          ARRAY_AGG(NULLIF(TRIM(c.proveedor), '') ORDER BY c.updated_at DESC),
          NULL
        ))[1] AS proveedor,
        COALESCE((
          SELECT COUNT(*)::int
          FROM public.tours_comboact tca
          WHERE tca.id_relacionado = c.id_relacionado
            AND (tca.estatus IS TRUE OR tca.estatus = 't')
        ), 0) AS total_actividades
      FROM public.tours_combo c
      GROUP BY c.id_relacionado
      ORDER BY c.id_relacionado ASC;
    `;
    const { rows } = await pool.query(sql);
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('❌ /api/catalogos-combo:', err);
    return res.status(500).json({ ok: false, error: 'No se pudieron listar los catálogos de combos' });
  }
}

// (opcional) GET /api/catalogos-combo/:id/items  — si no lo tienes ya
export async function listarItemsCatalogo(req, res) {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.json({ ok: true, data: [] });

    const sql = `
      SELECT
        tca.actividad      AS nombre,
        tca.actividad_es   AS nombre_es
      FROM public.tours_comboact tca
      WHERE tca.id_relacionado = $1
        AND (tca.estatus IS TRUE OR tca.estatus = 't')
      ORDER BY COALESCE(NULLIF(TRIM(tca.actividad_es), ''), NULLIF(TRIM(tca.actividad), '')) ASC
    `;
    const { rows } = await pool.query(sql, [id]);
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('❌ /api/catalogos-combo/:id/items:', err);
    return res.status(500).json({ ok: false, error: 'No se pudieron listar las actividades del catálogo' });
  }
}

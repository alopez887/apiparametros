// actividades/actividadcombo/listarCatalogosCombo.js
import pool from '../../conexion.js';

/**
 * GET /api/catalogos-combo
 * Respuesta por fila:
 * { id_relacionado, proveedor, total_actividades }
 */
export async function listarCatalogosCombo(_req, res) {
  try {
    const sql = `
      SELECT id_relacionado, proveedor, total_actividades
      FROM public.v_catalogos_combo
      ORDER BY id_relacionado;
    `;
    const { rows } = await pool.query(sql);
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('❌ /api/catalogos-combo:', e);
    res.status(500).json({ ok: false, error: 'No se pudieron listar los catálogos de combos' });
  }
}

/**
 * GET /api/catalogos-combo/:id/items
 * Devuelve nombres ES/EN de actividades del catálogo (ordenados).
 */
export async function listarItemsDeCatalogo(req, res) {
  try {
    const id = String(req.params.id || req.query.id || '').trim();
    if (!id) return res.json({ ok: true, data: [] });

    const sql = `
      SELECT
        actividad_es,
        actividad AS actividad_en
      FROM public.v_catalogo_items
      WHERE id_relacionado = $1
      ORDER BY COALESCE(NULLIF(TRIM(actividad_es), ''), NULLIF(TRIM(actividad), '')) ASC
    `;
    const { rows } = await pool.query(sql, [id]);

    // mantener compatibilidad de claves
    const data = rows.map(x => ({
      actividad_es: x.actividad_es || null,
      actividad:    x.actividad_en || null
    }));

    res.json({ ok: true, data });
  } catch (e) {
    console.error('❌ /api/catalogos-combo/:id/items:', e);
    res.status(500).json({ ok: false, error: 'No se pudieron listar las actividades del catálogo' });
  }
}

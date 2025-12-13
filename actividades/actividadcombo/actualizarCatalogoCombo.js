// actividades/actividadcombo/actualizarCatalogoCombo.js
import pool from '../../conexion.js';

const trim = v => String(v ?? '').trim();

function zipActividades(listEs = [], listEn = []) {
  const a = Array.isArray(listEs) ? listEs.map(x => trim(x)).filter(Boolean) : [];
  const b = Array.isArray(listEn) ? listEn.map(x => trim(x)).filter(Boolean) : [];
  const L = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < L; i++) {
    const es = a[i] || b[i] || '';
    const en = b[i] || a[i] || '';
    if (!es && !en) continue;
    out.push({ es, en });
  }
  return out;
}

async function hasColumn(client, table, column) {
  const q = await client.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND column_name=$2
      LIMIT 1`,
    [table, column]
  );
  return q.rows.length > 0;
}

function toId(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : s;
}

/**
 * PUT/PATCH /api/catalogos-combo/:id
 * Body esperado (del iframe):
 * {
 *   proveedor: "CACTUS TOURS",
 *   actividad: ["HORSE", "ATV"],        // EN
 *   actividad_es: ["CABALLO", "CUATRIMOTO"] // ES
 * }
 *
 * Actualiza el catálogo COMPLETO:
 * - borra items actuales del id_relacionado
 * - inserta nuevamente la lista (zip ES/EN)
 * - conserva el estatus anterior del catálogo (si existe columna estatus)
 */
export async function actualizarCatalogoCombo(req, res) {
  const idRel = toId(req.params.id);
  if (idRel == null) return res.status(400).json({ error: 'id_relacionado requerido en URL' });

  const body = req.body || {};

  // soporta variaciones por si cambiaste keys
  const proveedor = trim(body.proveedor);
  const listEn = Array.isArray(body.actividad) ? body.actividad
              : Array.isArray(body.actividades_en) ? body.actividades_en
              : [];
  const listEs = Array.isArray(body.actividad_es) ? body.actividad_es
              : Array.isArray(body.actividades_es) ? body.actividades_es
              : [];

  const pairs = zipActividades(listEs, listEn);

  if (!proveedor) return res.status(400).json({ error: 'proveedor es requerido' });
  if (!pairs.length) {
    return res.status(400).json({ error: 'Debes enviar al menos 1 actividad en ES/EN (actividad y actividad_es).' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // validar existencia de catálogo
    const ex = await client.query(
      'SELECT 1 FROM tours_comboact WHERE id_relacionado = $1 LIMIT 1',
      [idRel]
    );
    if (!ex.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Catálogo no encontrado' });
    }

    const colEstatus = (await hasColumn(client, 'tours_comboact', 'estatus')) ? 'estatus'
                    : (await hasColumn(client, 'tours_comboact', 'activo')) ? 'activo'
                    : null;

    // conservar estatus actual si existe
    let estatusActual = true;
    if (colEstatus) {
      const qE = await client.query(
        `SELECT ${colEstatus} AS v
           FROM tours_comboact
          WHERE id_relacionado = $1
          LIMIT 1`,
        [idRel]
      );
      if (qE.rows.length) estatusActual = !!qE.rows[0].v;
    }

    // borrar items actuales del catálogo
    await client.query('DELETE FROM tours_comboact WHERE id_relacionado = $1', [idRel]);

    // insertar nuevos items (multi-values)
    // columnas base siempre:
    const cols = ['id_relacionado', 'proveedor', 'actividad', 'actividad_es'];
    if (colEstatus) cols.push(colEstatus);

    const values = [];
    const placeholders = pairs.map((p, i) => {
      const base = i * (colEstatus ? 5 : 4);
      values.push(idRel, proveedor, p.en, p.es);
      if (colEstatus) values.push(estatusActual);

      if (colEstatus) return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });

    const sql = `
      INSERT INTO tours_comboact (${cols.join(', ')})
      VALUES ${placeholders.join(', ')}
    `;

    await client.query(sql, values);

    await client.query('COMMIT');
    return res.json({
      ok: true,
      id_relacionado: idRel,
      proveedor,
      total: pairs.length
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}

    // Unique violation (ej: uq_tours_comboact proveedor+actividad)
    if (err?.code === '23505') {
      return res.status(409).json({
        error: 'Actividad duplicada para ese proveedor (restricción UNIQUE). Si esa actividad existe en otro catálogo del mismo proveedor, no se puede repetir.',
        detail: err?.detail || undefined
      });
    }

    console.error('💥 actualizarCatalogoCombo error:', err);
    return res.status(500).json({ error: 'Error al actualizar el catálogo' });
  } finally {
    client.release();
  }
}

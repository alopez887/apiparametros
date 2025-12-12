// actividades/actividadcombo/crearCatalogoCombo.js
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

async function nextCatalogGroupId(client) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('tours_combo_group'))`);
  const { rows } = await client.query(`
    SELECT COALESCE(MAX(id_relacionado), 0) + 1 AS gid
      FROM public.tours_comboact
  `);
  return Number(rows?.[0]?.gid || 1);
}

// ✅ NAMED EXPORT (para import { crearCatalogoCombo } ...)
export async function crearCatalogoCombo(req, res) {
  const b = req.body || {};

  const proveedor = trim(b.proveedor);
  const estatus   = (b.estatus === undefined) ? true : !!b.estatus;

  const listEN_in = Array.isArray(b.actividad) ? b.actividad : [];
  const listES_in = Array.isArray(b.actividad_es) ? b.actividad_es : [];

  const pairs = zipActividades(listES_in, listEN_in);
  if (!proveedor || !pairs.length) {
    return res.status(400).json({ error: 'Proveedor requerido y al menos 1 actividad ES/EN.' });
  }

  const arrES = pairs.map(p => p.es);
  const arrEN = pairs.map(p => p.en);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // si llega id_relacionado lo usamos; si no, lo generamos seguro
    let id_relacionado = Number(b.id_relacionado);
    if (!Number.isFinite(id_relacionado) || id_relacionado <= 0) {
      id_relacionado = await nextCatalogGroupId(client);
    }

    // evita duplicado del grupo
    const exists = await client.query(
      `SELECT 1 FROM public.tours_comboact WHERE id_relacionado = $1 LIMIT 1`,
      [id_relacionado]
    );
    if (exists.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ese id_relacionado ya existe.' });
    }

    await client.query(`
      INSERT INTO public.tours_comboact
        (id_relacionado, proveedor, actividad, actividad_es, estatus)
      VALUES
        ($1, $2, $3::text[], $4::text[], $5)
    `, [id_relacionado, proveedor, arrEN, arrES, estatus]);

    await client.query('COMMIT');
    return res.status(201).json({ ok: true, id_relacionado });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('💥 crearCatalogoCombo error:', err);
    return res.status(500).json({ error: 'No se pudo guardar el catálogo.' });
  } finally {
    client.release();
  }
}

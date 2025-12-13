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
 * PUT /api/catalogos-combo/:id
 * Body:
 * {
 *   proveedor: "TOP ANGELS",
 *   actividad: ["Parachute","Fortimoto"],      // EN
 *   actividad_es: ["Banana","Cuatrimotos"]     // ES
 * }
 *
 * ✅ 1 fila por catálogo:
 * UPDATE tours_comboact
 *   SET proveedor=?, actividad=text[], actividad_es=text[]
 * WHERE id_relacionado=?
 */
export async function actualizarCatalogoCombo(req, res) {
  const idRel = toId(req.params.id);
  if (idRel == null) return res.status(400).json({ error: 'id_relacionado requerido en URL' });

  const b = req.body || {};
  const proveedor = trim(b.proveedor);

  const listEN_in =
    Array.isArray(b.actividad) ? b.actividad :
    Array.isArray(b.actividades_en) ? b.actividades_en :
    [];

  const listES_in =
    Array.isArray(b.actividad_es) ? b.actividad_es :
    Array.isArray(b.actividades_es) ? b.actividades_es :
    [];

  const pairs = zipActividades(listES_in, listEN_in);

  if (!proveedor) return res.status(400).json({ error: 'proveedor es requerido' });
  if (!pairs.length) return res.status(400).json({ error: 'Debes enviar al menos 1 actividad ES/EN.' });

  const arrES = pairs.map(p => p.es);
  const arrEN = pairs.map(p => p.en);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // validar existencia del catálogo (1 fila)
    const ex = await client.query(
      `SELECT id_relacionado
         FROM public.tours_comboact
        WHERE id_relacionado = $1
        LIMIT 1`,
      [idRel]
    );
    if (!ex.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Catálogo no encontrado' });
    }

    const colEstatus =
      (await hasColumn(client, 'tours_comboact', 'estatus')) ? 'estatus' :
      (await hasColumn(client, 'tours_comboact', 'activo')) ? 'activo' :
      null;

    // ✅ NO tocamos estatus aquí (se cambia en endpoint separado)
    // Solo actualizamos proveedor + arrays
    if (colEstatus) {
      await client.query(
        `
        UPDATE public.tours_comboact
           SET proveedor   = $2,
               actividad   = $3::text[],
               actividad_es= $4::text[]
         WHERE id_relacionado = $1
        `,
        [idRel, proveedor, arrEN, arrES]
      );
    } else {
      // igual funciona aunque no exista estatus/activo
      await client.query(
        `
        UPDATE public.tours_comboact
           SET proveedor   = $2,
               actividad   = $3::text[],
               actividad_es= $4::text[]
         WHERE id_relacionado = $1
        `,
        [idRel, proveedor, arrEN, arrES]
      );
    }

    await client.query('COMMIT');
    return res.json({ ok: true, id_relacionado: idRel, proveedor, total: pairs.length });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}

    // Unique violation (si tuvieras alguna restricción rara)
    if (err?.code === '23505') {
      return res.status(409).json({
        error: 'Restricción UNIQUE: dato duplicado.',
        detail: err?.detail || undefined
      });
    }

    console.error('💥 actualizarCatalogoCombo error:', err);
    return res.status(500).json({ error: 'Error al actualizar el catálogo' });
  } finally {
    client.release();
  }
}

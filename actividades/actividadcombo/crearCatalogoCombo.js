// actividades/actividadcombo/crearCatalogoCombo.js
import pool from '../../conexion.js';

function trimOrNull(v){
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function zipActividades(listEs = [], listEn = []) {
  const a = Array.isArray(listEs) ? listEs.map(s => String(s || '').trim()).filter(Boolean) : [];
  const b = Array.isArray(listEn) ? listEn.map(s => String(s || '').trim()).filter(Boolean) : [];
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

export async function crearCatalogoCombo(req, res){
  const b = req.body || {};

  const id_relacionado_in = b.id_relacionado;
  const proveedor_in      = trimOrNull(b.proveedor);
  const estatus_in        = (b.estatus === undefined) ? true : !!b.estatus;

  const listEN_in = Array.isArray(b.actividad) ? b.actividad : [];
  const listES_in = Array.isArray(b.actividad_es) ? b.actividad_es : [];

  const id_relacionado = Number(id_relacionado_in);

  if (!Number.isFinite(id_relacionado) || !proveedor_in){
    return res.status(400).json({ ok:false, error:'Faltan campos: id_relacionado y proveedor.' });
  }

  const pairs = zipActividades(listES_in, listEN_in);
  if (!pairs.length){
    return res.status(400).json({ ok:false, error:'Debes capturar al menos 1 actividad en ES y EN.' });
  }

  const arrES = pairs.map(p => p.es);
  const arrEN = pairs.map(p => p.en);

  const client = await pool.connect();
  try{
    await client.query('BEGIN');

    // Evitar duplicado del grupo
    const exists = await client.query(
      `SELECT 1 FROM public.tours_comboact WHERE id_relacionado = $1 LIMIT 1`,
      [id_relacionado]
    );
    if (exists.rows.length){
      await client.query('ROLLBACK');
      return res.status(409).json({ ok:false, error:'Ese id_relacionado ya existe.' });
    }

    await client.query(`
      INSERT INTO public.tours_comboact
        (id_relacionado, proveedor, actividad, actividad_es, estatus)
      VALUES
        ($1, $2, $3::text[], $4::text[], $5)
    `, [id_relacionado, proveedor_in, arrEN, arrES, estatus_in]);

    await client.query('COMMIT');
    return res.status(201).json({ ok:true });
  }catch(err){
    await client.query('ROLLBACK').catch(()=>{});
    console.error('💥 crearCatalogoCombo error:', err);

    if (err?.code === '23505'){
      return res.status(409).json({ ok:false, error:'Duplicado: ya existe ese catálogo.' });
    }
    return res.status(500).json({ ok:false, error:'No se pudo guardar el catálogo.' });
  }finally{
    client.release();
  }
}

export default crearCatalogoCombo;

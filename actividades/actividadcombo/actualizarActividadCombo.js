import pool from '../../conexion.js';
import { agregarActividadCombo } from './agregarActividadCombo.js'; // para reusar helpers, si quieres

// Helpers locales (copiados de agregarActividadCombo)
const toNumOrNull = v => { if (v===''||v==null) return null; const n=Number(String(v).replace(/[^0-9.\-]/g,'')); return Number.isFinite(n)?n:null; };
const trimOrNull  = v => { if (v==null) return null; const s=String(v).trim(); return s===''?null:s; };

async function codigoDuplicadoFueraDeMiId(client, codigo, id){
  // En otras tablas (dur/pax/anp) puedes reusar la CTE de tu archivo de “agregar”
  const { rows: r1 } = await client.query(
    `SELECT 1 FROM public.tours_combo WHERE LOWER(TRIM(codigo))=LOWER(TRIM($1)) AND id<>$2 LIMIT 1`,
    [codigo, id]
  );
  return r1.length > 0;
}

// Saca un siguiente id_relacionado si vas a crear NUEVO catálogo
async function nextCatalogGroupId(client){
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('tours_combo_group'))`);
  const { rows } = await client.query(`SELECT COALESCE(MAX(id_relacionado),0)+1 AS gid FROM public.tours_combo`);
  return Number(rows?.[0]?.gid || 1);
}

export async function actualizarActividadCombo(req, res){
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id<=0) return res.status(400).json({ error:'ID inválido' });

  const b = req.body || {};

  const codigo           = trimOrNull(b.codigo);
  const moneda           = (trimOrNull(b.moneda) || 'USD').toUpperCase();
  const nombre_combo     = trimOrNull(b.nombre_combo);
  const nombre_combo_es  = trimOrNull(b.nombre_combo_es);
  const cantidad         = toNumOrNull(b.cantidad_actividades);
  const precio           = toNumOrNull(b.precio);
  const precio_normal    = toNumOrNull(b.precio_normal);
  const precioopc        = toNumOrNull(b.precioopc);

  const group_mode       = (b.group_mode === 'existing' || b.group_mode === 'new') ? b.group_mode : 'none';
  const id_rel_body      = toNumOrNull(b.id_relacionado);
  const proveedor_body   = trimOrNull(b.proveedor);

  const acts_es_in = Array.isArray(b.actividades_es) ? b.actividades_es : [];
  const acts_en_in = Array.isArray(b.actividades_en) ? b.actividades_en : [];

  if (!codigo || !(nombre_combo || nombre_combo_es)) {
    return res.status(400).json({ error:'Faltan campos (codigo y al menos un nombre).' });
  }

  const client = await pool.connect();
  try{
    await client.query('BEGIN');

    // Asegura que exista
    const { rows: curRows } = await client.query(`SELECT * FROM public.tours_combo WHERE id=$1 LIMIT 1`, [id]);
    const current = curRows?.[0];
    if (!current){
      await client.query('ROLLBACK');
      return res.status(404).json({ error:'Registro no encontrado' });
    }

    // Lock por código para evitar condiciones de carrera
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [codigo]);

    // Validación de código (no debe existir en otras filas combo ni otros catálogos)
    if (await codigoDuplicadoFueraDeMiId(client, codigo, id)){
      await client.query('ROLLBACK');
      return res.status(409).json({ error:'El código ya existe en combos.', code:'duplicate' });
    }
    // (Opcional) aquí reusa tu CTE de “agregar” para revisar anp/dur/pax también.
    // Si detectas choque, 409 con detalle.

    // Resolver id_relacionado / proveedor según modo
    let id_relacionado = current.id_relacionado;
    let proveedor      = current.proveedor;

    if (group_mode === 'existing'){
      if (!id_rel_body) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error:'Selecciona un catálogo existente (id_relacionado).' });
      }
      id_relacionado = id_rel_body;
      proveedor      = proveedor_body || proveedor; // opcional: forzar a proveedor del catálogo si lo pasas del front

    } else if (group_mode === 'new'){
      if (!proveedor_body){
        await client.query('ROLLBACK');
        return res.status(400).json({ error:'Proveedor requerido para crear un nuevo catálogo.' });
      }
      const es = Array.isArray(acts_es_in) ? acts_es_in.map(s=>String(s||'').trim()).filter(Boolean) : [];
      const en = Array.isArray(acts_en_in) ? acts_en_in.map(s=>String(s||'').trim()).filter(Boolean) : [];
      if (!es.length && !en.length){
        await client.query('ROLLBACK');
        return res.status(400).json({ error:'Agrega al menos una actividad (ES o EN) para el nuevo catálogo.' });
      }

      id_relacionado = await nextCatalogGroupId(client);
      proveedor      = proveedor_body;

      await client.query(
        `INSERT INTO public.tours_comboact (id_relacionado, proveedor, actividad, actividad_es, estatus)
         VALUES ($1,$2,$3::text[],$4::text[], TRUE)`,
        [id_relacionado, proveedor, (en.length?en:es), (es.length?es:en)]
      );
    }
    // group_mode === 'none' → deja id_relacionado/proveedor como están (o lo que venga en body si decides permitirlo)

    // UPDATE
    const { rows: upRows } = await client.query(
      `UPDATE public.tours_combo
          SET codigo=$1, nombre_combo=$2, nombre_combo_es=$3, moneda=$4,
              proveedor=$5, cantidad_actividades=$6, precio=$7, precio_normal=$8, precioopc=$9,
              id_relacionado=$10, updated_at=NOW()
        WHERE id=$11
      RETURNING *;`,
      [ codigo, nombre_combo, nombre_combo_es, moneda,
        proveedor, cantidad, precio, precio_normal, precioopc,
        id_relacionado, id ]
    );

    await client.query('COMMIT');
    return res.json({ ok:true, data: upRows[0] });

  }catch(err){
    await client.query('ROLLBACK').catch(()=>{});
    console.error('💥 actualizarActividadCombo error:', err);
    if (err?.code === '22P02'){
      return res.status(400).json({ error:'Formato de arreglo inválido en actividades.', code:'bad_array_literal' });
    }
    return res.status(500).json({ error:'Error al actualizar el combo.' });
  }finally{
    client.release();
  }
}

export default actualizarActividadCombo;

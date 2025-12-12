// actividades/actividadcombo/actualizarActividadCombo.js
import pool from '../../conexion.js';

// Helpers locales
const toNumOrNull = v => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const trimOrNull = v => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/** Empareja arrays ES/EN; si uno falta, rellena con el otro */
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

async function codigoDuplicadoFueraDeMiId(client, codigo, id) {
  const { rows } = await client.query(
    `SELECT 1
       FROM public.tours_combo
      WHERE LOWER(TRIM(codigo)) = LOWER(TRIM($1))
        AND id <> $2
      LIMIT 1`,
    [codigo, id]
  );
  return rows.length > 0;
}

/**
 * ✅ Proveedor real del catálogo por id_relacionado (tours_comboact)
 */
async function proveedorDeCatalogo(client, id_relacionado) {
  const { rows } = await client.query(`
    SELECT DISTINCT ON (tca.id_relacionado)
           NULLIF(BTRIM(tca.proveedor), '') AS proveedor
      FROM public.tours_comboact tca
     WHERE tca.id_relacionado = $1
       AND (tca.estatus IS TRUE OR tca.estatus = 't')
       AND NULLIF(BTRIM(tca.proveedor), '') IS NOT NULL
     ORDER BY tca.id_relacionado, tca.updated_at DESC, tca.id DESC
     LIMIT 1;
  `, [id_relacionado]);

  return rows?.[0]?.proveedor || null;
}

// ✅ Saca un siguiente id_relacionado si vas a crear NUEVO catálogo
// IMPORTANTE: MAX sale del catálogo (tours_comboact)
async function nextCatalogGroupId(client) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('tours_combo_group'))`);
  const { rows } = await client.query(`
    SELECT COALESCE(MAX(id_relacionado), 0) + 1 AS gid
      FROM public.tours_comboact
  `);
  return Number(rows?.[0]?.gid || 1);
}

export async function actualizarActividadCombo(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });

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
    return res.status(400).json({ error: 'Faltan campos (codigo y al menos un nombre).' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Asegura que exista
    const { rows: curRows } = await client.query(`SELECT * FROM public.tours_combo WHERE id = $1 LIMIT 1`, [id]);
    const current = curRows?.[0];
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    // Lock por código para evitar condiciones de carrera
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [codigo]);

    // Validación de código (no debe existir en otras filas combo)
    if (await codigoDuplicadoFueraDeMiId(client, codigo, id)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El código ya existe en combos.', code: 'duplicate' });
    }
    // (Opcional) aquí puedes reusar tu validación global (dur/pax/anp) si quieres.

    // Resolver id_relacionado / proveedor según modo
    let id_relacionado = current.id_relacionado;
    let proveedor      = current.proveedor;

    if (group_mode === 'existing') {
      if (!id_rel_body) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Selecciona un catálogo existente (id_relacionado).' });
      }

      id_relacionado = id_rel_body;

      const provCat = await proveedorDeCatalogo(client, id_relacionado);
      if (!provCat) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'El catálogo seleccionado no existe o no tiene proveedor válido.' });
      }

      if (proveedor_body && provCat.toLowerCase().trim() !== proveedor_body.toLowerCase().trim()) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `El catálogo ${id_relacionado} pertenece a "${provCat}", no a "${proveedor_body}".`,
          code: 'catalog_provider_mismatch'
        });
      }

      proveedor = provCat;

    } else if (group_mode === 'new') {
      if (!proveedor_body) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Proveedor requerido para crear un nuevo catálogo.' });
      }

      const pairs = zipActividades(acts_es_in, acts_en_in);
      if (!pairs.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Agrega al menos una actividad (ES o EN) para el nuevo catálogo.' });
      }

      const arrES = pairs.map(p => p.es);
      const arrEN = pairs.map(p => p.en);

      id_relacionado = await nextCatalogGroupId(client);
      proveedor      = proveedor_body;

      await client.query(
        `INSERT INTO public.tours_comboact (id_relacionado, proveedor, actividad, actividad_es, estatus)
         VALUES ($1, $2, $3::text[], $4::text[], TRUE)`,
        [id_relacionado, proveedor, arrEN, arrES]
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
      [
        codigo, nombre_combo, nombre_combo_es, moneda,
        proveedor, cantidad, precio, precio_normal, precioopc,
        id_relacionado, id
      ]
    );

    await client.query('COMMIT');
    return res.json({ ok: true, data: upRows[0] });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('💥 actualizarActividadCombo error:', err);

    if (err?.code === '22P02') {
      return res.status(400).json({ error: 'Formato de arreglo inválido en actividades.', code: 'bad_array_literal' });
    }
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Llave duplicada.', code: 'duplicate' });
    }

    return res.status(500).json({ error: 'Error al actualizar el combo.' });
  } finally {
    client.release();
  }
}

export default actualizarActividadCombo;

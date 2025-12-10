// actividades/combos/agregarActividadCombo.js
import pool from '../../conexion.js';

/* =========================
 * Etiquetas de catálogos para mensajes de duplicado
 * ========================= */
const LABELS = {
  anp:   { es: 'Adultos / Niños / Persona',          en: 'Adults / Children / Per person' },
  dur:   { es: 'Actividades por duración (tiempo)',  en: 'Activities by duration (time)' },
  pax:   { es: 'Actividades por PAX (grupo)',        en: 'Activities by PAX (group)' },
  combo: { es: 'Combos de actividades',              en: 'Activity combos' },
};

/**
 * Valida un código en TODAS las tablas (tours, tourduracion, tour_pax, tours_combo)
 * Devuelve: [{ table:'dur'|'pax'|'anp'|'combo', nombre, label_es, label_en }]
 */
async function codigoDetallesGlobal(client, codigo) {
  const sql = `
    WITH q AS (SELECT LOWER(TRIM($1)) AS c)
    SELECT cat, nombre FROM (
      SELECT 'dur'   AS cat, COALESCE(td.nombre, td.codigo)       AS nombre
        FROM public.tourduracion td, q
       WHERE LOWER(TRIM(td.codigo)) = q.c
      UNION ALL
      SELECT 'pax'   AS cat, COALESCE(tp.actividad, tp.codigo)    AS nombre
        FROM public.tour_pax tp, q
       WHERE LOWER(TRIM(tp.codigo)) = q.c
      UNION ALL
      SELECT 'anp'   AS cat, COALESCE(t.nombre, t.codigo)         AS nombre
        FROM public.tours t, q
       WHERE LOWER(TRIM(t.codigo)) = q.c
      UNION ALL
      SELECT 'combo' AS cat, COALESCE(tc.nombre_combo, tc.codigo) AS nombre
        FROM public.tours_combo tc, q
       WHERE LOWER(TRIM(tc.codigo)) = q.c
    ) s
    LIMIT 50;
  `;
  const { rows } = await client.query(sql, [codigo]);
  return rows.map(r => ({
    table: r.cat,
    nombre: r.nombre,
    label_es: LABELS[r.cat].es,
    label_en: LABELS[r.cat].en,
  }));
}

// Normalizadores
const toNumOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const trimOrNull = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/** Empareja arrays ES/EN a longitud máxima; si uno falta, rellena con el otro */
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

/**
 * Genera un nuevo id_relacionado seguro dentro de la transacción.
 * Usa un advisory lock global para evitar carreras si no existe sequence.
 * Si tienes un sequence, cámbialo por: SELECT nextval('tours_combo_group_seq') AS gid;
 */
async function nextCatalogGroupId(client) {
  // Candado global por nombre lógico del grupo
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('tours_combo_group'))`);
  const { rows } = await client.query(`
    SELECT COALESCE(MAX(id_relacionado), 0) + 1 AS gid
      FROM public.tours_combo
  `);
  return Number(rows?.[0]?.gid || 1);
}

/**
 * Inserta en tours_combo (y opcionalmente tours_comboact si group_mode='new').
 * Mantiene intacto el flujo "Agregar a catálogo existente".
 */
export async function agregarActividadCombo(req, res) {
  const b = req.body || {};

  // === Requeridos base
  const codigo           = trimOrNull(b.codigo);
  const moneda           = (trimOrNull(b.moneda) || 'USD').toUpperCase();
  const nombre_combo     = trimOrNull(b.nombre_combo);     // EN
  const nombre_combo_es  = trimOrNull(b.nombre_combo_es);  // ES

  if (!codigo || !moneda || !(nombre_combo || nombre_combo_es)) {
    return res.status(400).json({
      error: 'Faltan campos obligatorios: codigo, moneda y al menos un nombre (EN o ES).',
    });
  }

  // === Extras comunes
  const cantidad_actividades = toNumOrNull(b.cantidad_actividades);
  const precio               = toNumOrNull(b.precio);
  const precio_normal        = toNumOrNull(b.precio_normal);
  const precioopc            = toNumOrNull(b.precioopc);

  // === Control de grupo (lo manda el front)
  const group_mode     = (b.group_mode === 'existing' || b.group_mode === 'new') ? b.group_mode : 'none';
  const id_rel_body    = toNumOrNull(b.id_relacionado); // solo válido si 'existing'
  const proveedor_body = trimOrNull(b.proveedor);

  // === Listas para nuevo catálogo (opcional)
  const actividades_es = Array.isArray(b.actividades_es) ? b.actividades_es : [];
  const actividades_en = Array.isArray(b.actividades_en) ? b.actividades_en : [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 🔒 lock por código para evitar duplicados simultáneos
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [codigo]);

    // ===== Validación GLOBAL (4 catálogos)
    const dupList = await codigoDetallesGlobal(client, codigo);
    if (dupList.length > 0) {
      const nombresES = [...new Set(dupList.map(d => d.label_es))].join(', ');
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Error: El código que intentas registrar ya existe en: ${nombresES}.`,
        code: 'duplicate',
        fields: { codigo: true },
        catalogs: dupList,
      });
    }

    // ========= Ramas por group_mode =========
    let id_relacionado = null;
    let proveedor      = null;
    let insertedActs   = 0;

    if (group_mode === 'existing') {
      // --- Flujo existente (NO se toca tours_comboact)
      if (!id_rel_body) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Selecciona un catálogo existente (id_relacionado).' });
      }
      id_relacionado = id_rel_body;
      // proveedor viene del catálogo seleccionado; el front nos lo manda bloqueado en el select
      proveedor = proveedor_body || null;

    } else if (group_mode === 'new') {
      // --- Nuevo catálogo: proveedor y actividades requeridos
      if (!proveedor_body) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Proveedor requerido para crear un nuevo catálogo.' });
      }
      const pairs = zipActividades(actividades_es, actividades_en);
      if (!pairs.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Debes capturar al menos una actividad para el nuevo catálogo.' });
      }

      proveedor = proveedor_body;
      id_relacionado = await nextCatalogGroupId(client);

      // Insertar actividades del nuevo catálogo en tours_comboact
      // Columnas observadas en tu tabla: id, proveedor, actividad, estatus, created_at, updated_at, actividad_es, id_relacionado
      const textActs = `
        INSERT INTO public.tours_comboact
          (proveedor, actividad, actividad_es, id_relacionado, estatus)
        VALUES ($1, $2, $3, $4, TRUE)
      `;
      for (const { es, en } of pairs) {
        await client.query(textActs, [proveedor, en || es, es || en, id_relacionado]);
        insertedActs++;
      }

    } else {
      // --- Ni existing ni new: permitimos crear combo “sueltito” sin catálogo (comportamiento previo)
      id_relacionado = toNumOrNull(b.id_relacionado);
      proveedor      = proveedor_body || null;
    }

    // ===== INSERT en tours_combo (común a ambos modos)
    const textCombo = `
      INSERT INTO public.tours_combo
        (codigo, nombre_combo, nombre_combo_es, moneda,
         proveedor, cantidad_actividades, precio, precio_normal, precioopc, id_relacionado)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id, codigo, nombre_combo, nombre_combo_es, moneda, proveedor,
                cantidad_actividades, precio, precio_normal, precioopc,
                id_relacionado, created_at, updated_at;
    `;
    const paramsCombo = [
      codigo,
      nombre_combo,
      nombre_combo_es,
      moneda,
      proveedor,
      cantidad_actividades,
      precio,
      precio_normal,
      precioopc,
      id_relacionado,
    ];
    const { rows: rowsCombo } = await client.query(textCombo, paramsCombo);
    const combo = rowsCombo?.[0] || null;

    await client.query('COMMIT');
    return res.status(201).json({
      ok: true,
      data: {
        ...combo,
        group_mode,
        actividades_insertadas: insertedActs,
      },
    });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('💥 agregarActividadCombo error:', err);

    if (err && err.code === '23505') {
      return res.status(409).json({
        error: 'Error: El código que intentas registrar ya existe, favor de confirmar.',
        code: 'duplicate',
        fields: { codigo: true },
      });
    }
    return res.status(500).json({ error: 'Error al crear el combo.' });
  } finally {
    client.release();
  }
}

export default agregarActividadCombo;
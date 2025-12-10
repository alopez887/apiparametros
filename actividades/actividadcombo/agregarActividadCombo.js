// actividades/combos/agregarActividadCombo.js
import pool from '../../conexion.js';

/* =========================
 * Catálogos (mismas etiquetas que en duración/estándar)
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

/**
 * Inserta en tours_combo (con validación GLOBAL de código)
 */
export async function agregarActividadCombo(req, res) {
  const b = req.body || {};

  // Requeridos
  const codigo           = trimOrNull(b.codigo);
  const moneda           = (trimOrNull(b.moneda) || 'USD').toUpperCase();
  const nombre_combo     = trimOrNull(b.nombre_combo);     // EN
  const nombre_combo_es  = trimOrNull(b.nombre_combo_es);  // ES

  if (!codigo || !moneda || !(nombre_combo || nombre_combo_es)) {
    return res.status(400).json({
      error: 'Faltan campos obligatorios: codigo, moneda y al menos un nombre (EN o ES).',
    });
  }

  // Opcionales
  const proveedor            = trimOrNull(b.proveedor);
  const cantidad_actividades = toNumOrNull(b.cantidad_actividades);
  const precio               = toNumOrNull(b.precio);
  const precio_normal        = toNumOrNull(b.precio_normal);
  const precioopc            = toNumOrNull(b.precioopc);
  const id_relacionado       = toNumOrNull(b.id_relacionado); // por si agrupas catálogos

  // INSERT parametrizado (ajusta columnas si tu tabla tiene otras)
  const text = `
    INSERT INTO public.tours_combo
      (codigo, nombre_combo, nombre_combo_es, moneda,
       proveedor, cantidad_actividades, precio, precio_normal, precioopc, id_relacionado)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id, codigo, nombre_combo, nombre_combo_es, moneda, proveedor,
              cantidad_actividades, precio, precio_normal, precioopc,
              id_relacionado, created_at, updated_at
  `;
  const params = [
    codigo, nombre_combo, nombre_combo_es, moneda,
    proveedor, cantidad_actividades, precio, precio_normal, precioopc,
    id_relacionado
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 🔒 Evita carreras simultáneas por mismo código
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [codigo]);

    // ===== Validación GLOBAL (4 catálogos) =====
    const dupList = await codigoDetallesGlobal(client, codigo);
    if (dupList.length > 0) {
      const nombresES = [...new Set(dupList.map(d => d.label_es))].join(', ');
      const msg = `Error: El código que intentas registrar ya existe en: ${nombresES}.`;
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: msg,
        code: 'duplicate',
        fields: { codigo: true },
        catalogs: dupList, // <-- para que el front pinte exactamente dónde
      });
    }

    // ===== INSERT en tours_combo =====
    const { rows } = await client.query(text, params);
    await client.query('COMMIT');
    return res.status(201).json({ ok: true, data: rows?.[0] ?? null });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('💥 agregarActividadCombo error:', err);

    // Respaldo por UNIQUE constraint
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

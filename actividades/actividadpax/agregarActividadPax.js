// actividades/actividadpax/agregarActividadPax.js
import pool from '../../conexion.js';

/* =========================
 * Catálogos (igual que en duración)
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
      SELECT 'dur'  AS cat, COALESCE(td.nombre, td.codigo) AS nombre
        FROM tourduracion td, q
       WHERE LOWER(TRIM(td.codigo)) = q.c
      UNION ALL
      SELECT 'pax'  AS cat, COALESCE(tp.actividad, tp.codigo) AS nombre
        FROM tour_pax tp, q
       WHERE LOWER(TRIM(tp.codigo)) = q.c
      UNION ALL
      SELECT 'anp'  AS cat, COALESCE(t.nombre, t.codigo) AS nombre
        FROM tours t, q
       WHERE LOWER(TRIM(t.codigo)) = q.c
      UNION ALL
      SELECT 'combo' AS cat, COALESCE(tc.nombre_combo, tc.codigo) AS nombre
        FROM tours_combo tc, q
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

/* =========================
 * Helpers (igual estilo que duración)
 * ========================= */
const toNumberOrNull = (v) => {
  if (v === '' || v === undefined || v === null) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const toTextOrNull = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const toBoolOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).toLowerCase();
  if (['1','true','t','activo','active','yes','y'].includes(s)) return true;
  if (['0','false','f','inactivo','inactive','no','n'].includes(s)) return false;
  return null;
};

/**
 * POST /api/actividades-pax/agregar
 * Body (PAX):
 * {
 *   codigo,
 *   actividad,        // o nombre (se mapea)
 *   duracion,         // "tiempo" (EN)
 *   duracion_es,      // "tiempo" (ES)
 *   capacidad,
 *   capacidad_es,
 *   precio,
 *   precio_normal,
 *   precioopc,
 *   moneda,
 *   proveedor,
 *   actividad_id,     // si groupMode === 'existente'
 *   groupMode,        // 'existente' | 'nuevo' | 'none'
 *   estatus           // opcional
 * }
 */
export async function agregarActividadPax(req, res) {
  let {
    codigo,
    nombre,
    actividad,
    duracion,
    duracion_es,
    capacidad,
    capacidad_es,
    precio,
    precio_normal,
    precioopc,
    moneda,
    proveedor,
    actividad_id,
    groupMode,
    estatus,
  } = req.body ?? {};

  // Normalización
  codigo       = toTextOrNull(codigo);
  const actividadFinal = toTextOrNull(actividad ?? nombre); // acepta "actividad" o "nombre"
  duracion     = toTextOrNull(duracion);
  duracion_es  = toTextOrNull(duracion_es);
  capacidad    = toTextOrNull(capacidad);
  capacidad_es = toTextOrNull(capacidad_es);

  precio        = toNumberOrNull(precio);
  precio_normal = toNumberOrNull(precio_normal);
  precioopc     = toNumberOrNull(precioopc);

  moneda     = (toTextOrNull(moneda) || 'USD').toUpperCase();
  proveedor  = toTextOrNull(proveedor);
  estatus    = toBoolOrNull(estatus);

  // Requeridos mínimos (mismo criterio que en duración)
  if (!codigo || !actividadFinal || !duracion || !moneda) {
    return res.status(400).json({
      error: 'Faltan campos requeridos: codigo, actividad, duracion, moneda',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 🔒 Evita carreras por el mismo código
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [codigo]);

    // === Resolver actividad_id (PAX) ===
    const mode = String(groupMode || 'nuevo').toLowerCase(); // por default grupo nuevo
    let actividadIdFinal = null;

    if (mode === 'existente') {
      const parsed = Number(actividad_id);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'actividad_id inválido para groupMode "existente"',
        });
      }
      actividadIdFinal = String(parsed); // columna TEXT
    } else {
      // 'nuevo' o 'none' => MAX(actividad_id::int) + 1 dentro de tour_pax
      const { rows: rAct } = await client.query(`
        SELECT COALESCE(MAX(actividad_id::int), 0) + 1 AS next
        FROM tour_pax
        WHERE actividad_id ~ '^[0-9]+$'
      `);
      actividadIdFinal = String(Number(rAct?.[0]?.next) || 1);
    }

    // ===== Validaciones previas (mismo estilo que duración) =====
    // (A) Global por código + catálogos donde existe
    const dupList = await codigoDetallesGlobal(client, codigo);
    const existeCodigoGlobal = dupList.length > 0;

    // (B) (actividad_id, duracion) único en tour_pax
    let dupDuracion = false;
    if (actividadIdFinal && duracion) {
      const { rows: chk2 } = await client.query(
        `
          SELECT EXISTS(
            SELECT 1 FROM tour_pax
            WHERE actividad_id = $1 AND LOWER(TRIM(duracion)) = LOWER(TRIM($2))
          ) AS dup_duracion
        `,
        [actividadIdFinal, duracion]
      );
      dupDuracion = !!chk2?.[0]?.dup_duracion;
    }

    if (existeCodigoGlobal || dupDuracion) {
      const fields = {};
      const msgs = [];

      if (existeCodigoGlobal) {
        const nombresES = [...new Set(dupList.map(d => d.label_es))].join(', ');
        msgs.push(`Error: El código que intentas registrar ya existe en: ${nombresES}.`);
        fields.codigo = true;
      }

      if (dupDuracion) {
        msgs.push('Error: La duración que intentas registrar ya existe en ese grupo, favor de confirmar.');
        fields.duracion = true;
      }

      await client.query('ROLLBACK');
      return res.status(409).json({
        error: msgs.join(' '),
        code: 'duplicate',
        fields,
        catalogs: dupList, // ← CLAVE para que el front muestre las etiquetas correctas
      });
    }

    // ===== INSERT en tour_pax (PAX real) =====
    const text = `
      INSERT INTO public.tour_pax (
        codigo,
        actividad,
        duracion_es,
        duracion,
        capacidad_es,
        capacidad,
        precio,
        precio_normal,
        precioopc,
        moneda,
        proveedor,
        actividad_id,
        estatus,
        created_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13, TRUE),NOW(),NOW()
      )
      RETURNING
        id,
        codigo,
        actividad,
        duracion_es,
        duracion,
        capacidad_es,
        capacidad,
        precio,
        precio_normal,
        precioopc,
        moneda,
        proveedor,
        actividad_id,
        estatus,
        created_at,
        updated_at;
    `;

    const params = [
      codigo,
      actividadFinal,
      duracion_es,
      duracion,
      capacidad_es,
      capacidad,
      precio,
      precio_normal,
      precioopc,
      moneda,
      proveedor,
      actividadIdFinal,
      estatus,
    ];

    const { rows } = await client.query(text, params);
    await client.query('COMMIT');

    const data = rows?.[0] ?? null;
    return res.status(201).json({ ok: true, data });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('💥 agregarActividadPax error:', err);

    // Respaldo por UNIQUE (igual estilo que duración) — AHORA con catalogs
    if (err && err.code === '23505') {
      let msg = 'Registro duplicado.';
      const c = String(err.constraint || '').toLowerCase();
      const detail = String(err.detail || '').toLowerCase();

      if (
        c.includes('uk_tour_pax_actividad_duracion') ||
        c.includes('uk_tourpax_actividad_duracion') ||
        detail.includes('(actividad_id, duracion)')
      ) {
        msg = 'Error: La duración que intentas registrar ya existe en ese grupo, favor de confirmar.';
      } else if (
        c.includes('tour_pax_codigo_key') ||
        c.includes('uk_tour_pax_codigo') ||
        detail.includes('(codigo)')
      ) {
        msg = 'Error: El código que intentas registrar ya existe, favor de confirmar.';
      }

      // 🔧 Recalcular catálogos para que el front muestre los labels correctos
      let dupList = [];
      try {
        dupList = await codigoDetallesGlobal(client, codigo);
      } catch {}

      return res.status(409).json({
        error: msg,
        code: 'duplicate',
        catalogs: dupList,            // ← CLAVE
        constraint: err.constraint || null,
        detail: err.detail || null,
      });
    }

    return res.status(500).json({ error: 'Error al crear la actividad PAX.' });
  } finally {
    client.release();
  }
}

export default agregarActividadPax;

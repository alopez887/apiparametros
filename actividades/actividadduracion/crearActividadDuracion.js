// /actividades/actividadduracion/crearActividadDuracion.js
import pool from '../../conexion.js';

/**
 * POST /api/actividades-duracion
 * Body:
 * {
 *   codigo, nombre, duracion, duracion_es,
 *   precio_adulto, precionormal_adulto, precioopc_adulto,
 *   moneda, proveedor,
 *   actividad_id,        // si groupMode === 'existente'
 *   groupMode            // 'existente' | 'nuevo' | 'none'
 *   estatus              // (opcional) true|false|'activo'|'inactivo'
 * }
 */

/* =========================
 * Helpers locales (inline)
 * ========================= */

/** Normalizadores */
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
 * Devuelve dónde existe el código a nivel global (las 4 tablas del catálogo).
 * Regresa arreglo con etiquetas legibles en ES/EN.
 *  [
 *    { table:'dur'|'pax'|'anp'|'combo', id, nombre, label_es, label_en }
 *  ]
 */
async function codigoDetallesGlobal(client, codigo) {
  const LABELS = {
    anp:  { es: 'Adultos / Niños / Persona', en: 'Adults / Children / Per person' },
    dur:  { es: 'Actividades por duración (tiempo)', en: 'Activities by duration (time)' },
    pax:  { es: 'Actividades por PAX (grupo)', en: 'Activities by PAX (group)' },
    combo:{ es: 'Combos de actividades', en: 'Activity combos' },
  };

  const sql = `
    WITH q AS (SELECT LOWER(TRIM($1)) AS c)
    SELECT cat, id, nombre FROM (
      SELECT 'dur'  AS cat, td.id, td.nombre
        FROM tourduracion td, q
       WHERE LOWER(TRIM(td.codigo)) = q.c
      UNION ALL
      SELECT 'pax'  AS cat, tp.id, COALESCE(tp.actividad, tp.codigo) AS nombre
        FROM tour_pax tp, q
       WHERE LOWER(TRIM(tp.codigo)) = q.c
      UNION ALL
      SELECT 'anp'  AS cat, t.id, COALESCE(t.nombre, t.codigo) AS nombre
        FROM tours t, q
       WHERE LOWER(TRIM(t.codigo)) = q.c
      UNION ALL
      SELECT 'combo' AS cat, tc.id, COALESCE(tc.nombre_combo, tc.codigo) AS nombre
        FROM tours_combo tc, q
       WHERE LOWER(TRIM(tc.codigo)) = q.c
    ) s
    LIMIT 20;
  `;
  const { rows } = await client.query(sql, [codigo]);
  return rows.map(r => ({
    table: r.cat,
    id: r.id,
    nombre: r.nombre,
    label_es: LABELS[r.cat].es,
    label_en: LABELS[r.cat].en,
  }));
}

/** true/false rápido si te basta saber que existe globalmente */
async function codigoExisteEnCatalogo(client, codigo) {
  const q = `
    SELECT EXISTS (
      SELECT 1 FROM tourduracion WHERE LOWER(TRIM(codigo)) = LOWER(TRIM($1))
      UNION ALL
      SELECT 1 FROM tour_pax     WHERE LOWER(TRIM(codigo)) = LOWER(TRIM($1))
      UNION ALL
      SELECT 1 FROM tours        WHERE LOWER(TRIM(codigo)) = LOWER(TRIM($1))
      UNION ALL
      SELECT 1 FROM tours_combo  WHERE LOWER(TRIM(codigo)) = LOWER(TRIM($1))
    ) AS exists
  `;
  const { rows } = await client.query(q, [codigo]);
  return rows?.[0]?.exists === true;
}

/* =========================
 * Handler principal
 * ========================= */

export async function crearActividadDuracion(req, res) {
  // ===== Body + limpieza =====
  let {
    codigo,
    nombre,
    duracion,
    duracion_es,
    precio_adulto,
    precionormal_adulto,
    precioopc_adulto,
    moneda,
    proveedor,
    actividad_id,
    groupMode,   // 'existente' | 'nuevo' | 'none'
    estatus,     // opcional
  } = req.body ?? {};

  codigo       = toTextOrNull(codigo);
  nombre       = toTextOrNull(nombre);
  duracion     = toTextOrNull(duracion);
  duracion_es  = toTextOrNull(duracion_es);
  precio_adulto        = toNumberOrNull(precio_adulto);
  precionormal_adulto  = toNumberOrNull(precionormal_adulto);
  precioopc_adulto     = toNumberOrNull(precioopc_adulto);
  moneda       = (toTextOrNull(moneda) || 'USD').toUpperCase();
  proveedor    = toTextOrNull(proveedor);
  estatus      = toBoolOrNull(estatus);

  if (!codigo || !nombre || !duracion || !moneda) {
    return res.status(400).json({ error: 'Faltan campos requeridos: codigo, nombre, duracion, moneda' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 🔒 Evita carrera: dos inserts con el mismo código al mismo tiempo
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [codigo]);

    // ===== Resolver actividad_id (TEXT) =====
    const mode = String(groupMode || 'nuevo').toLowerCase(); // por default creamos grupo nuevo
    let actividadIdFinal = null;

    if (mode === 'existente') {
      const parsed = Number(actividad_id);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'actividad_id inválido para groupMode "existente"' });
      }
      actividadIdFinal = String(parsed); // columna TEXT
    } else {
      // 'nuevo' o 'none' => MAX(actividad_id::int) + 1 dentro de tourduracion
      const { rows } = await client.query(`
        SELECT COALESCE(MAX(actividad_id::int), 0) + 1 AS next
        FROM tourduracion
        WHERE actividad_id ~ '^[0-9]+$'
      `);
      actividadIdFinal = String(Number(rows?.[0]?.next) || 1);
    }

    // ===== Validaciones previas =====
    // (A) Global por código + catálogos donde existe
    const dupList = await codigoDetallesGlobal(client, codigo);
    const existeCodigoGlobal = dupList.length > 0;

    // (B) (actividad_id, duracion) único en tourduracion
    const { rows: chk2 } = await client.query(
      `
        SELECT EXISTS(
          SELECT 1 FROM tourduracion
          WHERE actividad_id = $1 AND LOWER(TRIM(duracion)) = LOWER(TRIM($2))
        ) AS dup_duracion
      `,
      [actividadIdFinal, duracion]
    );
    const dupDuracion = !!chk2?.[0]?.dup_duracion;

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
        catalogs: dupList   // para el front, si lo quieres usar
      });
    }

    // ===== Insert =====
    const sql = `
      INSERT INTO tourduracion (
        codigo, nombre, duracion, duracion_es,
        precio_adulto, precionormal_adulto, precioopc_adulto,
        moneda, proveedor, actividad_id, estatus, created_at, update_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10, COALESCE($11, TRUE), NOW(), NOW()
      )
      RETURNING
        id, codigo, nombre, duracion, duracion_es,
        precio_adulto, precionormal_adulto, precioopc_adulto,
        moneda, proveedor, actividad_id, estatus, created_at, update_at;
    `;

    const params = [
      codigo, nombre, duracion, duracion_es,
      precio_adulto, precionormal_adulto, precioopc_adulto,
      moneda, proveedor, actividadIdFinal, estatus,
    ];

    const result = await client.query(sql, params);
    await client.query('COMMIT');

    return res.json({
      ok: true,
      msg: 'Actividad por duración creada',
      data: result.rows[0],
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ crearActividadDuracion:', err);

    // Respaldo por UNIQUE
    if (err && err.code === '23505') {
      let msg = 'Registro duplicado.';
      const c = String(err.constraint || '').toLowerCase();
      const detail = String(err.detail || '').toLowerCase();

      if (c.includes('uk_tourduracion_actividad_duracion') || detail.includes('(actividad_id, duracion)')) {
        msg = 'Error: La duración que intentas registrar ya existe en ese grupo, favor de confirmar.';
      } else if (
        c.includes('tourduracion_codigo_key') ||
        c.includes('uk_tourduracion_codigo') ||
        detail.includes('(codigo)')
      ) {
        msg = 'Error: El código que intentas registrar ya existe, favor de confirmar.';
      }

      return res.status(409).json({
        error: msg,
        code: 'duplicate',
        constraint: err.constraint || null,
        detail: err.detail || null
      });
    }

    return res.status(500).json({ error: 'Error interno al crear actividad por duración' });
  } finally {
    client.release();
  }
}

export default crearActividadDuracion;

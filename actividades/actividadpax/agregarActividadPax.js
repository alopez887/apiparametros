/// /actividades/actividadpax/agregarActividadPax.js
import pool from '../../conexion.js';

/* =========================
 * Catálogos (igual que en duración)
 * ========================= */
const LABELS = {
  anp:  { es: 'Adultos / Niños / Persona',          en: 'Adults / Children / Per person' },
  dur:  { es: 'Actividades por duración (tiempo)',  en: 'Activities by duration (time)' },
  pax:  { es: 'Actividades por PAX (grupo)',        en: 'Activities by PAX (group)' },
  combo:{ es: 'Combos de actividades',              en: 'Activity combos' },
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

/**
 * POST /api/actividades-pax/agregar
 * Body:
 * {
 *   codigo, nombre,
 *   precio_adulto, precio_nino,
 *   precionormal_adulto, precionormal_nino,
 *   precioopc_adulto, precioopc_nino,
 *   moneda, proveedor,
 *   actividad_id,        // si groupMode === 'existente'
 *   groupMode            // 'existente' | 'nuevo' | 'none'
 * }
 */

export async function agregarActividadPax(req, res) {
  const body = req.body || {};

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

  // Requeridos
  const codigo  = trimOrNull(body.codigo);
  const nombre  = trimOrNull(body.nombre);
  const moneda  = (trimOrNull(body.moneda) || 'USD').toUpperCase();

  if (!codigo || !nombre || !moneda) {
    return res.status(400).json({
      error: 'Faltan campos obligatorios: codigo, nombre y moneda.',
    });
  }

  // Opcionales numéricos (se guardan null cuando no hay valor)
  const precio_adulto        = toNumOrNull(body.precio_adulto);
  const precio_nino          = toNumOrNull(body.precio_nino);
  const precionormal_adulto  = toNumOrNull(body.precionormal_adulto);
  const precionormal_nino    = toNumOrNull(body.precionormal_nino);
  const precioopc_adulto     = toNumOrNull(body.precioopc_adulto);
  const precioopc_nino       = toNumOrNull(body.precioopc_nino);

  // Proveedor opcional
  const proveedor = trimOrNull(body.proveedor);

  // === Flujo de actividad_id (igual que en duración) ===
  const rawActividadId = body.actividad_id;
  const groupMode = String(body.groupMode || 'nuevo').toLowerCase(); // por default grupo nuevo
  let actividadIdFinal = null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 🔒 Evita carreras por el mismo código
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [codigo]);

    // Resolver actividad_id
    if (groupMode === 'existente') {
      const parsed = Number(rawActividadId);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'actividad_id inválido para groupMode "existente"',
        });
      }
      actividadIdFinal = String(parsed); // columna TEXT
    } else {
      // 'nuevo' o 'none' => MAX(actividad_id::int) + 1 dentro de TOURS
      const { rows: rAct } = await client.query(`
        SELECT COALESCE(MAX(actividad_id::int), 0) + 1 AS next
        FROM tours
        WHERE actividad_id ~ '^[0-9]+$'
      `);
      actividadIdFinal = String(Number(rAct?.[0]?.next) || 1);
    }

    // ===== Validación GLOBAL de código en las 4 tablas =====
    const dupList = await codigoDetallesGlobal(client, codigo);
    const existeCodigoGlobal = dupList.length > 0;

    if (existeCodigoGlobal) {
      const nombresES = [...new Set(dupList.map(d => d.label_es))].join(', ');
      // MISMA FRASE que en duración (AGREGAR/ACTUALIZAR)
      const msg = `Error: El código que intentas registrar ya existe en: ${nombresES}.`;

      await client.query('ROLLBACK');
      return res.status(409).json({
        error: msg,
        code: 'duplicate',
        fields: { codigo: true },
        catalogs: dupList, // para que el front pueda armar mensajes si quiere
      });
    }

    // ===== INSERT en tours =====
    const text = `
      INSERT INTO public.tours
        (codigo, nombre,
         precio_adulto, precio_nino,
         precionormal_adulto, precionormal_nino,
         precioopc_adulto, precioopc_nino,
         moneda, proveedor, actividad_id)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING
        id, codigo, nombre,
        precio_adulto, precio_nino,
        precionormal_adulto, precionormal_nino,
        precioopc_adulto, precioopc_nino,
        moneda, proveedor, actividad_id,
        created_at, updated_at
    `;

    const params = [
      codigo, nombre,
      precio_adulto, precio_nino,
      precionormal_adulto, precionormal_nino,
      precioopc_adulto, precioopc_nino,
      moneda, proveedor,
      actividadIdFinal,
    ];

    const { rows } = await client.query(text, params);
    await client.query('COMMIT');

    const data = rows?.[0] ?? null;
    return res.status(201).json({ ok: true, data });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('💥 agregarActividadPax error:', err);

    // Respaldo por UNIQUE (por si algo se cuela)
    if (err && err.code === '23505') {
      // Mantengo mismo estilo que en duración
      return res.status(409).json({
        error: 'Error: El código que intentas registrar ya existe, favor de confirmar.',
        code: 'duplicate',
        fields: { codigo: true },
      });
    }

    return res.status(500).json({ error: 'Error al crear la actividad.' });
  } finally {
    client.release();
  }
}

export default agregarActividadPax;

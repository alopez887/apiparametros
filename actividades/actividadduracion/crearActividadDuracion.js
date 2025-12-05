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
export async function crearActividadDuracion(req, res) {
  try {
    // ===== Normalizadores =====
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

    // ===== Body =====
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

    // ===== Limpieza =====
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

    // Requeridos mínimos
    if (!codigo || !nombre || !duracion || !moneda) {
      return res.status(400).json({ error: 'Faltan campos requeridos: codigo, nombre, duracion, moneda' });
    }

    // ===== PRE-CHECK: código único en toda la tabla =====
    {
      const { rows } = await pool.query(
        `SELECT 1
           FROM tourduracion
          WHERE LOWER(TRIM(codigo)) = LOWER(TRIM($1))
          LIMIT 1`,
        [codigo]
      );
      if (rows.length) {
        return res.status(409).json({
          error: 'Error: El código que intentas registrar ya existe. Favor de validar.',
          code: 'duplicate_codigo'
        });
      }
    }

    // ===== Resolver actividad_id (columna TEXT) =====
    const mode = String(groupMode || 'nuevo').toLowerCase(); // por default creamos grupo nuevo
    let actividadIdFinal = null;

    if (mode === 'existente') {
      // Debe venir un ID numérico válido
      const parsed = Number(actividad_id);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'actividad_id inválido para groupMode "existente"' });
      }
      actividadIdFinal = String(parsed); // columna es TEXT, guardamos como texto
    } else {
      // 'nuevo' o 'none' => sacar consecutivo numérico: MAX(actividad_id::int) + 1
      const { rows } = await pool.query(`
        SELECT COALESCE(MAX(actividad_id::int), 0) + 1 AS next
        FROM tourduracion
        WHERE actividad_id ~ '^[0-9]+$'
      `);
      actividadIdFinal = String(Number(rows?.[0]?.next) || 1); // guardar como texto
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

    const result = await pool.query(sql, params);

    return res.json({
      ok: true,
      msg: 'Actividad por duración creada',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('❌ crearActividadDuracion:', err);

    // Duplicados (unique_violation)
    if (err && err.code === '23505') {
      let msg = 'Registro duplicado.';
      const c = String(err.constraint || '').toLowerCase();
      const detail = String(err.detail || '').toLowerCase();

      if (c.includes('uk_tourduracion_actividad_duracion') || detail.includes('(actividad_id, duracion)')) {
        msg = 'Error: La duración que intentas registrar ya existe en ese grupo. Favor de validar.';
      } else if (
        c.includes('tourduracion_codigo_key') ||
        c.includes('uk_tourduracion_codigo') ||
        detail.includes('(codigo)')
      ) {
        msg = 'Error: El código que intentas registrar ya existe. Favor de validar.';
      }

      return res.status(409).json({
        error: msg,
        code: 'duplicate',
        constraint: err.constraint || null,
        detail: err.detail || null
      });
    }

    return res.status(500).json({ error: 'Error interno al crear actividad por duración' });
  }
}

export default crearActividadDuracion;

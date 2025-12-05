//actividades/actividadduracion/crearActividadDuracion.js

import pool from '../../conexion.js';

/**
 * POST /api/actividades-duracion
 * Body:
 *  { codigo, nombre, duracion, duracion_es,
 *    precio_adulto, precionormal_adulto, precioopc_adulto,
 *    moneda, proveedor,
 *    actividad_id, groupMode } // 'existente' | 'nuevo' | 'none'
 */
export async function crearActividadDuracion(req, res) {
  try {
    let {
      codigo, nombre, duracion, duracion_es,
      precio_adulto, precionormal_adulto, precioopc_adulto,
      moneda, proveedor, actividad_id, groupMode
    } = req.body ?? {};

    const toNum = v => {
      if (v === '' || v == null) return null;
      const n = Number(String(v).replace(/[^0-9.\-]/g,''));
      return Number.isFinite(n) ? n : null;
    };
    const toTxt = v => {
      if (v == null) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    };

    codigo      = toTxt(codigo);
    nombre      = toTxt(nombre);
    duracion    = toTxt(duracion);
    duracion_es = toTxt(duracion_es);
    moneda      = (toTxt(moneda) || 'USD').toUpperCase();
    proveedor   = toTxt(proveedor);

    precio_adulto        = toNum(precio_adulto);
    precionormal_adulto  = toNum(precionormal_adulto);
    precioopc_adulto     = toNum(precioopc_adulto);

    if (!codigo || !nombre || !duracion || !moneda) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    // Resolver actividad_id según groupMode
    const mode = String(groupMode || 'nuevo').toLowerCase();
    let actividadIdFinal;

    if (mode === 'existente') {
      const parsed = Number(actividad_id);
      if (!Number.isFinite(parsed)) {
        return res.status(400).json({ error: 'actividad_id inválido para groupMode "existente"' });
      }
      actividadIdFinal = parsed;
    } else {
      // 'nuevo' o 'none' => nuevo consecutivo de grupo
      const { rows } = await pool.query(
        'SELECT COALESCE(MAX(actividad_id), 0) + 1 AS next FROM tourduracion;'
      );
      actividadIdFinal = Number(rows?.[0]?.next) || 1;
    }

    const { rows: ins } = await pool.query(
      `INSERT INTO tourduracion
         (codigo, nombre, duracion, duracion_es,
          precio_adulto, precionormal_adulto, precioopc_adulto,
          moneda, proveedor, actividad_id, estatus, created_at, update_at)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, TRUE, NOW(), NOW())
       RETURNING id, codigo, actividad_id, created_at, update_at AS updated_at;`,
      [
        codigo, nombre, duracion, duracion_es,
        precio_adulto, precionormal_adulto, precioopc_adulto,
        moneda, proveedor, actividadIdFinal
      ]
    );

    return res.json({ ok: true, msg: 'Actividad por duración creada', data: ins[0] });
  } catch (err) {
    console.error('❌ crearActividadDuracion:', err);
    return res.status(500).json({ error: 'Error al crear actividad por duración' });
  }
}

export default crearActividadDuracion;

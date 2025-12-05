// /actividades/actividadduracion/actualizarActividadDuracion.js
import pool from '../../conexion.js';

export async function actualizarActividadDuracion(req, res) {
  try {
    const { id } = req.params;

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
      actividad_id,   // opcional en edición
    } = req.body ?? {};

    // Normaliza
    codigo      = toTextOrNull(codigo);
    nombre      = toTextOrNull(nombre);
    duracion    = toTextOrNull(duracion);
    duracion_es = toTextOrNull(duracion_es);
    precio_adulto        = toNumberOrNull(precio_adulto);
    precionormal_adulto  = toNumberOrNull(precionormal_adulto);
    precioopc_adulto     = toNumberOrNull(precioopc_adulto);
    moneda      = (toTextOrNull(moneda) || 'USD').toUpperCase();
    proveedor   = toTextOrNull(proveedor);
    actividad_id = toTextOrNull(actividad_id);

    if (!id) return res.status(400).json({ error: 'Id requerido' });
    if (!codigo || !nombre || !duracion || !moneda) {
      return res.status(400).json({ error: 'Faltan campos requeridos: codigo, nombre, duracion, moneda' });
    }

    // ===== PRE-CHECK: código único en toda la tabla (excluyendo el propio id) =====
    {
      const { rows } = await pool.query(
        `SELECT 1
           FROM tourduracion
          WHERE LOWER(TRIM(codigo)) = LOWER(TRIM($1))
            AND id <> $2
          LIMIT 1`,
        [codigo, id]
      );
      if (rows.length) {
        return res.status(409).json({
          error: 'Error: El código que intentas registrar ya existe. Favor de validar.',
          code: 'duplicate_codigo'
        });
      }
    }

    const sql = `
      UPDATE tourduracion SET
        codigo = $1,
        nombre = $2,
        duracion = $3,
        duracion_es = $4,
        precio_adulto = $5,
        precionormal_adulto = $6,
        precioopc_adulto = $7,
        moneda = $8,
        proveedor = $9,
        actividad_id = COALESCE($10, actividad_id),
        update_at = NOW()
      WHERE id = $11
      RETURNING id, codigo, nombre, duracion, duracion_es,
        precio_adulto, precionormal_adulto, precioopc_adulto,
        moneda, proveedor, actividad_id, estatus, created_at, update_at;
    `;
    const params = [
      codigo, nombre, duracion, duracion_es,
      precio_adulto, precionormal_adulto, precioopc_adulto,
      moneda, proveedor, actividad_id, id
    ];

    const r = await pool.query(sql, params);
    if (!r.rowCount) return res.status(404).json({ error: 'Actividad no encontrada' });

    return res.json({ ok: true, msg: 'Actividad por duración actualizada', data: r.rows[0] });
  } catch (err) {
    console.error('❌ actualizarActividadDuracion:', err);

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

    return res.status(500).json({ error: 'Error interno al actualizar actividad por duración' });
  }
}

export default actualizarActividadDuracion;

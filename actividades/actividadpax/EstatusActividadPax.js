// actividades/actividadpax/EstatusActividadPax.js
import pool from '../../conexion.js';

export async function EstatusActividadPax(req, res) {
  try {
    // Acepta :codigo o :id en la ruta
    const codigo = String(req.params?.codigo ?? req.params?.id ?? '').trim();
    if (!codigo) {
      return res.status(400).json({ error: 'Parámetro codigo inválido' });
    }

    const body = req.body || {};
    let nuevoActivo;

    // "activo" boolean o truthy/falsy comunes
    if (typeof body.activo === 'boolean') {
      nuevoActivo = body.activo;
    } else if (['1', 1, 'true', 't', 'yes', 'y'].includes(body.activo)) {
      nuevoActivo = true;
    } else if (['0', 0, 'false', 'f', 'no', 'n'].includes(body.activo)) {
      nuevoActivo = false;
    }

    // "estatus" string alternativo
    if (typeof nuevoActivo !== 'boolean' && typeof body.estatus === 'string') {
      const v = body.estatus.trim().toLowerCase();
      if (v === 'activo' || v === 'active') nuevoActivo = true;
      if (v === 'inactivo' || v === 'inactive') nuevoActivo = false;
    }

    if (typeof nuevoActivo !== 'boolean') {
      return res.status(400).json({
        error: 'Body inválido. Usa { "activo": true|false } o { "estatus": "activo"|"inactivo" }',
      });
    }

    const { rows, rowCount } = await pool.query(
      `
      UPDATE tour_pax
         SET estatus    = $1,
             updated_at = NOW()
       WHERE LOWER(TRIM(codigo)) = LOWER(TRIM($2))
       RETURNING codigo, actividad, estatus, updated_at
      `,
      [nuevoActivo, codigo]
    );

    if (!rowCount) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }

    return res.json({
      ok: true,
      data: rows[0],
      message: nuevoActivo ? 'Actividad activada' : 'Actividad desactivada',
      estatusTexto: nuevoActivo ? 'activo' : 'inactivo',
    });
  } catch (err) {
    console.error('❌ EstatusActividadPax:', err);
    return res.status(500).json({ error: 'Error al cambiar estatus de la actividad' });
  }
}

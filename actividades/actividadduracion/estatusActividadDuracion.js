// /actividades/actividadduracion/estatusActividadDuracion.js
import pool from '../../conexion.js';

export async function cambiarEstatusActividadDuracion(req, res) {
  try {
    const { id } = req.params;
    let { activo } = req.body || {};

    // normaliza a boolean
    const s = String(activo).toLowerCase();
    const flag = ['1','true','t','activo','active','yes','y'].includes(s);

    const sql = `
      UPDATE tourduracion
      SET estatus = $1, update_at = NOW()
      WHERE id = $2
      RETURNING id, estatus, update_at;
    `;
    const r = await pool.query(sql, [flag, id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Actividad no encontrada' });

    return res.json({ ok: true, data: r.rows[0] });
  } catch (err) {
    console.error('❌ cambiarEstatusActividadDuracion:', err);
    return res.status(500).json({ error: 'No se pudo cambiar el estatus' });
  }
}

export default cambiarEstatusActividadDuracion;

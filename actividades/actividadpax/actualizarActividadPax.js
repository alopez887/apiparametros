// /actividades/actividadpax/actualizarActividadPax.js
import pool from '../../conexion.js';

export async function EstatusActividadPax(req, res) {
  try {
    const { id } = req.params;

    // valida id numérico (si tu PK es numérica)
    const idNum = Number(id);
    if (!Number.isFinite(idNum)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // normaliza a boolean (true por: "1,true,t,activo,active,yes,y")
    const s = String((req.body || {}).activo).toLowerCase();
    const flag = ['1','true','t','activo','active','yes','y'].includes(s);

    const sql = `
      UPDATE public.tour_pax
         SET estatus = $1,
             updated_at = NOW()
       WHERE id = $2
       RETURNING id, estatus, updated_at;
    `;
    const r = await pool.query(sql, [flag, idNum]);

    if (!r.rowCount) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }

    return res.json({ ok: true, data: r.rows[0] });
  } catch (err) {
    console.error('❌ EstatusActividadPax:', err);
    return res.status(500).json({ error: 'No se pudo cambiar el estatus' });
  }
}

export default EstatusActividadPax;

import pool from '../../conexion.js';

export async function cambiarEstatusActividadCombo(req,res){
  const id = Number(req.params.id);
  const body = req.body || {};
  const activo = !!body.activo;
  if (!Number.isFinite(id)) return res.status(400).json({ error:'ID inválido' });
  try{
    const { rows } = await pool.query(
      `UPDATE public.tours_combo SET estatus=$1, updated_at=NOW() WHERE id=$2 RETURNING id, updated_at`,
      [activo, id]
    );
    if (!rows.length) return res.status(404).json({ error:'No encontrado' });
    res.json({ ok:true, data:{ id, updated_at: rows[0].updated_at } });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'No se pudo cambiar el estatus' });
  }
}

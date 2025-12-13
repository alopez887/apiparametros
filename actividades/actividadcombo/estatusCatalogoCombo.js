// actividades/actividadcombo/estatusCatalogoCombo.js
import pool from '../../conexion.js';

export async function estatusCatalogoCombo(req, res){
  const idRel = Number(req.params.id);
  const body  = req.body || {};

  // aceptar cualquiera de tus llaves del front
  const raw =
    (body.activo  !== undefined) ? body.activo  :
    (body.estatus !== undefined) ? body.estatus :
    (body.active  !== undefined) ? body.active  :
    (body.status  !== undefined) ? body.status  : undefined;

  if (!Number.isFinite(idRel)) return res.status(400).json({ error:'ID inválido' });
  if (raw === undefined) return res.status(400).json({ error:'Falta "activo"' });

  const activo = !!raw;

  try{
    // OJO: aquí es POR id_relacionado (catálogo), no por id (PK fila)
    const { rows } = await pool.query(
      `UPDATE public.tours_comboact
          SET estatus = $1,
              updated_at = NOW()
        WHERE id_relacionado = $2
        RETURNING updated_at`,
      [activo, idRel]
    );

    if (!rows.length) return res.status(404).json({ error:'No encontrado' });

    res.json({ ok:true, data:{ id_relacionado: idRel, updated_at: rows[0].updated_at } });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'No se pudo cambiar el estatus' });
  }
}

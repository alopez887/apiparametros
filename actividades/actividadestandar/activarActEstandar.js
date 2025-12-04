// actividades/actividadestandar/activarActEstandar.js
import pool from '../../conexion.js';

export async function cambiarEstatusActividadEstandar(req, res) {
  try {
    const { id } = req.params;

    if (!id || Number.isNaN(Number(id))) {
      return res.status(400).json({ error: 'Parámetro id inválido' });
    }

    const rid = Number(id);
    const body = req.body || {};
    let nuevoActivo;

    // Aceptamos activo booleano
    if (typeof body.activo === 'boolean') {
      nuevoActivo = body.activo;
    } else if (
      body.activo === 1 ||
      body.activo === '1' ||
      body.activo === 'true'
    ) {
      nuevoActivo = true;
    } else if (
      body.activo === 0 ||
      body.activo === '0' ||
      body.activo === 'false'
    ) {
      nuevoActivo = false;
    }

    // O aceptamos estatus string
    if (typeof nuevoActivo !== 'boolean' && typeof body.estatus === 'string') {
      const v = body.estatus.trim().toLowerCase();
      if (v === 'activo' || v === 'active') nuevoActivo = true;
      if (v === 'inactivo' || v === 'inactive') nuevoActivo = false;
    }

    if (typeof nuevoActivo !== 'boolean') {
      return res.status(400).json({
        error:
          'Body inválido. Usa { "activo": true|false } o { "estatus": "activo"|"inactivo" }',
      });
    }

    // Solo lo usamos para el mensaje al cliente
    const nuevoEstatusTexto = nuevoActivo ? 'activo' : 'inactivo';

    // 🔸 Actualizamos la columna boolean "estatus" y el updated_at
    const q = `
      UPDATE tours
         SET estatus    = $1,
             updated_at = NOW()
       WHERE id = $2
       RETURNING id, codigo, nombre, estatus, updated_at
    `;

    // 👈 Aquí ahora mandamos el booleano nuevoActivo, NO el texto "activo"/"inactivo"
    const { rows, rowCount } = await pool.query(q, [nuevoActivo, rid]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }

    return res.json({
      ok: true,
      data: rows[0],
      message:
        nuevoActivo
          ? 'Actividad activada'
          : 'Actividad desactivada',
      estatusTexto: nuevoEstatusTexto,
    });
  } catch (err) {
    console.error('❌ cambiarEstatusActividadEstandar:', err);
    return res
      .status(500)
      .json({ error: 'Error al cambiar estatus de la actividad' });
  }
}

// partners/estatusUsuarioPartners.js
import pool from '../conexion.js';

export async function estatusUsuarioPartners(req, res) {
  const { id } = req.params;
  const { activo } = req.body;

  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({
      ok: false,
      message: 'ID de usuario inválido.',
    });
  }

  if (activo === undefined || activo === null) {
    return res.status(400).json({
      ok: false,
      message: 'Falta el campo "activo" (true/false).',
    });
  }

  // aceptar boolean, 0/1 o "0"/"1"
  const nuevoActivo =
    activo === true ||
    activo === 1   ||
    activo === '1';

  try {
    const query = `
      UPDATE actividades_usuarios
         SET activo    = $1,
             updated_at = NOW()
       WHERE id = $2
       RETURNING id,
                 proveedor_id,
                 nombre,
                 usuario,
                 tipo_usuario,
                 activo,
                 created_at,
                 updated_at
    `;
    const params = [nuevoActivo, userId];

    const { rows } = await pool.query(query, params);

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado.',
      });
    }

    return res.json({
      ok: true,
      row: rows[0],
    });
  } catch (err) {
    console.error('❌ estatusUsuarioPartners:', err);
    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar el estatus del usuario.',
    });
  }
}

// /partners/actualizarUsuarioPartner.js
import pool from '../conexion.js';

export async function actualizarUsuarioPartner(req, res) {
  const id = Number(req.params.id);

  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({
      ok: false,
      message: 'ID de usuario inválido.',
    });
  }

  try {
    const {
      nombre,
      proveedor_id,
      tipo_usuario,
      usuario,
      password,
    } = req.body || {};

    if (!nombre || !proveedor_id || !tipo_usuario || !usuario) {
      return res.status(400).json({
        ok: false,
        message: 'Faltan campos obligatorios (nombre, proveedor_id, tipo_usuario, usuario).',
      });
    }

    const provId = Number(proveedor_id);
    if (!Number.isFinite(provId) || provId <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'proveedor_id inválido.',
      });
    }

    // OJO: ajusta el nombre real de tu tabla aquí
    let sql;
    let values;

    if (password && String(password).trim() !== '') {
      sql = `
        UPDATE usuarios_actividades
        SET
          nombre       = $1,
          proveedor_id = $2,
          tipo_usuario = $3,
          usuario      = $4,
          password     = $5,
          updated_at   = NOW()
        WHERE id = $6
        RETURNING
          id,
          nombre,
          proveedor_id,
          tipo_usuario,
          usuario,
          activo,
          created_at,
          updated_at;
      `;
      values = [
        nombre.trim(),
        provId,
        tipo_usuario.trim(),
        usuario.trim(),
        String(password).trim(),
        id,
      ];
    } else {
      sql = `
        UPDATE usuarios_actividades
        SET
          nombre       = $1,
          proveedor_id = $2,
          tipo_usuario = $3,
          usuario      = $4,
          updated_at   = NOW()
        WHERE id = $5
        RETURNING
          id,
          nombre,
          proveedor_id,
          tipo_usuario,
          usuario,
          activo,
          created_at,
          updated_at;
      `;
      values = [
        nombre.trim(),
        provId,
        tipo_usuario.trim(),
        usuario.trim(),
        id,
      ];
    }

    const { rows } = await pool.query(sql, values);

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
    console.error('❌ actualizarUsuarioPartner:', err);
    return res.status(500).json({
      ok: false,
      message: 'Error interno al actualizar el usuario.',
    });
  }
}

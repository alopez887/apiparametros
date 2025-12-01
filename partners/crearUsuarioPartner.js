// /partners/crearUsuarioPartner.js
import pool from '../conexion.js';

export async function crearUsuarioPartner(req, res) {
  try {
    const {
      nombre,
      proveedor_id,
      tipo_usuario,
      usuario,
      password,
    } = req.body || {};

    // 🔹 Validaciones básicas
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

    const nombreTrim   = String(nombre).trim();
    const usuarioTrim  = String(usuario).trim();
    const tipoTrim     = String(tipo_usuario).trim();
    const passwordTrim = password != null ? String(password).trim() : '';

    if (!nombreTrim || !usuarioTrim || !tipoTrim) {
      return res.status(400).json({
        ok: false,
        message: 'Campos nombre, usuario y tipo_usuario no pueden ir vacíos.',
      });
    }

    // 🔹 Inserción
    const sql = `
      INSERT INTO actividades_usuarios
        (nombre, proveedor_id, tipo_usuario, usuario, password, activo, created_at, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
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

    const values = [
      nombreTrim,
      provId,
      tipoTrim,
      usuarioTrim,
      passwordTrim,   // si quieres luego aquí metes hash
    ];

    const { rows } = await pool.query(sql, values);

    return res.status(201).json({
      ok: true,
      row: rows[0],
    });
  } catch (err) {
    console.error('❌ crearUsuarioPartner:', err);

    // Si hay constraint UNIQUE en "usuario", aquí normalmente llegará el error
    // y podemos mandar un mensaje más claro si quieres luego.
    return res.status(500).json({
      ok: false,
      message: 'Error interno al crear el usuario.',
    });
  }
}

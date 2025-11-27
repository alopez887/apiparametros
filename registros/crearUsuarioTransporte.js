// registros/crearUsuarioTransporte.js
import pool from '../conexion.js';

export async function crearUsuarioTransporte(req, res) {
  try {
    const { nombre, proveedor, usuario, password, tipo_usuario } = req.body || {};

    // Validación básica
    if (!nombre || !proveedor || !usuario || !password || !tipo_usuario) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan campos obligatorios',
      });
    }

    // ⚠️ IMPORTANTE:
    // Usa AQUÍ la MISMA TABLA y columnas que ya usas en listarUsuariosTransporte.
    // Tabla: usuarios_proveedor
    // Columnas: nombre, proveedor, usuario, password, tipo_usuario, activo
    const sql = `
      INSERT INTO usuarios_proveedor
        (nombre, proveedor, usuario, password, tipo_usuario, activo)
      VALUES
        ($1,    $2,        $3,      $4,       $5,           true)
      RETURNING
        id,
        nombre,
        proveedor,
        usuario,
        tipo_usuario,
        activo,
        creado,
        modificado
    `;

    const params = [nombre, proveedor, usuario, password, tipo_usuario];

    const { rows } = await pool.query(sql, params);
    const row = rows[0];

    return res.json({
      ok: true,
      usuario: row,
    });
  } catch (err) {
    console.error('❌ crearUsuarioTransporte error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error interno al crear usuario',
    });
  }
}

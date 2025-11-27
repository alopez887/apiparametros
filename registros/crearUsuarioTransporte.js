// registros/crearUsuarioTransporte.js
import pool from '../conexion.js';

export async function crearUsuarioTransporte(req, res) {
  console.log('👤 [crearUsuarioTransporte] body recibido:', req.body);

  try {
    const { nombre, proveedor, usuario, password, tipo_usuario } = req.body || {};

    // Validación básica
    if (!nombre || !proveedor || !usuario || !password || !tipo_usuario) {
      console.warn(
        '⚠️ [crearUsuarioTransporte] Faltan campos obligatorios:',
        { nombre, proveedor, usuario, password: !!password, tipo_usuario }
      );
      return res.status(400).json({
        ok: false,
        error: 'Faltan campos obligatorios',
      });
    }

    // ⚠️ IMPORTANTE:
    // Usa aquí la MISMA tabla/columnas que listarUsuariosTransporte.
    const sql = `
      INSERT INTO usuarios_transporte
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

    console.log('📌 [crearUsuarioTransporte] Ejecutando INSERT:', {
      sql: sql.trim(),
      params,
    });

    const { rows } = await pool.query(sql, params);
    const row = rows?.[0];

    console.log('✅ [crearUsuarioTransporte] Usuario creado:', row);

    return res.json({
      ok: true,
      usuario: row,
    });
  } catch (err) {
    console.error('❌ [crearUsuarioTransporte] Error en INSERT:', {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      stack: err?.stack,
    });

    return res.status(500).json({
      ok: false,
      error: 'Error interno al crear usuario',
      detail: err?.message || null,   // para que el front pueda ver algo más si quiere
      code: err?.code || null,
    });
  }
}

// registros/crearUsuarioTransporte.js
import pool from '../conexion.js';

export async function crearUsuarioTransporte(req, res) {
  console.log('🟦 [API] crearUsuarioTransporte body:', req.body);

  try {
    const { nombre, proveedor, usuario, password, tipo_usuario } = req.body || {};

    // Validación básica
    if (!nombre || !proveedor || !usuario || !password || !tipo_usuario) {
      console.warn('⚠️ [API] crearUsuarioTransporte faltan campos', {
        nombre,
        proveedor,
        usuario,
        tipo_usuario,
      });

      return res.status(400).json({
        ok: false,
        error: 'Faltan campos obligatorios',
      });
    }

    // ⚠️ IMPORTANTE:
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

    console.log('🟦 [API] crearUsuarioTransporte SQL params:', params);

    const { rows } = await pool.query(sql, params);
    const row = rows[0];

    console.log('✅ [API] crearUsuarioTransporte creado id:', row?.id);

    return res.json({
      ok: true,
      usuario: row,
    });
  } catch (err) {
    console.error('❌ [API] crearUsuarioTransporte error:', err);

    // Duplicado (violación de índice UNIQUE en Postgres)
    if (err?.code === '23505') {
      console.warn('⚠️ [API] crearUsuarioTransporte usuario duplicado (23505)');
      return res.status(409).json({
        ok: false,
        error: 'Ya existe un usuario con ese nombre de usuario',
      });
    }

    return res.status(500).json({
      ok: false,
      error: 'Error interno al crear usuario',
    });
  }
}

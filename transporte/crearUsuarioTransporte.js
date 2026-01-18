// registros/crearUsuarioTransporte.js
import pool from '../conexion.js';

/**
 * 🔹 ALTA DE USUARIO (SE DEJA IGUAL)
 */
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
    // Tabla: usuarios_cts
    // Columnas: nombre, proveedor, usuario, password, tipo_usuario, activo
    const sql = `
      INSERT INTO usuarios_cts
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

/**
 * 🔹 ACTUALIZAR DATOS DE USUARIO
 *   Ruta: PUT /api/registros/usuarios-transporte/:id
 *   Body: puede traer nombre, proveedor, usuario, password, tipo_usuario
 *   - Si algún campo viene, se actualiza.
 *   - Si password viene vacío/undefined, NO se toca el password.
 */
export async function actualizarUsuarioTransporte(req, res) {
  const { id } = req.params || {};
  const userId = Number(id);

  console.log('🟦 [API] actualizarUsuarioTransporte params.id =', id, 'body =', req.body);

  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({
      ok: false,
      error: 'ID de usuario inválido',
    });
  }

  try {
    const {
      nombre,
      proveedor,
      usuario,
      password,
      tipo_usuario,
    } = req.body || {};

    const setClauses = [];
    const params = [];
    let idx = 1;

    if (nombre !== undefined) {
      setClauses.push(`nombre = $${idx++}`);
      params.push(nombre);
    }
    if (proveedor !== undefined) {
      setClauses.push(`proveedor = $${idx++}`);
      params.push(proveedor);
    }
    if (usuario !== undefined) {
      setClauses.push(`usuario = $${idx++}`);
      params.push(usuario);
    }
    if (tipo_usuario !== undefined) {
      setClauses.push(`tipo_usuario = $${idx++}`);
      params.push(tipo_usuario);
    }
    // password solo si viene no vacío
    if (password !== undefined && String(password).trim() !== '') {
      setClauses.push(`password = $${idx++}`);
      params.push(password);
    }

    // Siempre actualizamos fecha de modificado
    setClauses.push(`modificado = NOW()`);

    if (setClauses.length === 1 && setClauses[0] === 'modificado = NOW()') {
      // No vino ningún campo útil para actualizar
      return res.status(400).json({
        ok: false,
        error: 'No hay campos para actualizar',
      });
    }

    params.push(userId);
    const sql = `
      UPDATE usuarios_cts
      SET ${setClauses.join(', ')}
      WHERE id = $${idx}
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

    console.log('🟦 [API] actualizarUsuarioTransporte SQL:', sql);
    console.log('🟦 [API] actualizarUsuarioTransporte params:', params);

    const { rows } = await pool.query(sql, params);

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Usuario no encontrado',
      });
    }

    const row = rows[0];
    console.log('✅ [API] actualizarUsuarioTransporte actualizado id:', row.id);

    return res.json({
      ok: true,
      usuario: row,
    });
  } catch (err) {
    console.error('❌ [API] actualizarUsuarioTransporte error:', err);

    // Duplicado de usuario (mismo índice UNIQUE que en crear)
    if (err?.code === '23505') {
      console.warn('⚠️ [API] actualizarUsuarioTransporte usuario duplicado (23505)');
      return res.status(409).json({
        ok: false,
        error: 'Ya existe un usuario con ese nombre de usuario',
      });
    }

    return res.status(500).json({
      ok: false,
      error: 'Error interno al actualizar usuario',
    });
  }
}

/**
 * 🔹 CAMBIAR ESTATUS ACTIVO (habilitar / deshabilitar)
 *   Ruta: PATCH /api/registros/usuarios-transporte/:id/activo
 *   Body: { activo: true|false }  (también acepta "true"/"false", 1/0, "1"/"0")
 */
export async function cambiarEstatusUsuarioTransporte(req, res) {
  const { id } = req.params || {};
  const userId = Number(id);

  console.log('🟦 [API] cambiarEstatusUsuarioTransporte params.id =', id, 'body =', req.body);

  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({
      ok: false,
      error: 'ID de usuario inválido',
    });
  }

  try {
    const raw = req.body ? req.body.activo : undefined;

    let nuevoActivo;
    if (raw === true || raw === 'true' || raw === 1 || raw === '1') {
      nuevoActivo = true;
    } else if (raw === false || raw === 'false' || raw === 0 || raw === '0') {
      nuevoActivo = false;
    } else {
      return res.status(400).json({
        ok: false,
        error: 'Valor de "activo" inválido',
      });
    }

    const sql = `
      UPDATE usuarios_cts
      SET
        activo = $1,
        modificado = NOW()
      WHERE id = $2
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

    const params = [nuevoActivo, userId];

    console.log('🟦 [API] cambiarEstatusUsuarioTransporte SQL params:', params);

    const { rows } = await pool.query(sql, params);

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Usuario no encontrado',
      });
    }

    const row = rows[0];
    console.log('✅ [API] cambiarEstatusUsuarioTransporte id:', row.id, 'activo =', row.activo);

    return res.json({
      ok: true,
      usuario: row,
    });
  } catch (err) {
    console.error('❌ [API] cambiarEstatusUsuarioTransporte error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error interno al cambiar estatus del usuario',
    });
  }
}

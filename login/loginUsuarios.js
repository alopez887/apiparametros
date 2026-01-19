// /apiparametros/loginUsuarios.js
import pool from '../conexion.js';

// ─────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────

// Mapea tipo_usuario → rol final:
// - administracion/admin/actividad_admin → 'actividad_admin'
// - operador/operacion/operaciones/actividad_operador/oper → 'actividad_operador'
// - resto: se respeta en minúsculas (representante, chofer, supervisor, administrador, sistemas, etc.)
const mapRol = (t = '') => {
  const s = String(t)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toLowerCase().trim();

  if (['administracion', 'admin', 'actividad_admin'].includes(s)) {
    return 'actividad_admin';
  }
  if (['operador', 'operacion', 'operaciones', 'actividad_operador', 'oper'].includes(s)) {
    return 'actividad_operador';
  }

  // transporte / otros: representante, chofer, supervisor, administrador, sistemas, etc.
  return s || '';
};

// Slugify proveedor: minúsculas, sin acentos, solo [a-z0-9]
const slugify = (s = '') =>
  String(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');

// 🔹 Expiración por fecha "modificado" (> 1 mes)
const MS_30_DIAS = 30 * 24 * 60 * 60 * 1000;
const isPasswordExpired = (modificado) => {
  if (!modificado) return false;
  const last = new Date(modificado);
  if (Number.isNaN(last.getTime())) return false;
  const diff = Date.now() - last.getTime();
  return diff > MS_30_DIAS;
};

export default async function loginUsuarios(req, res) {
  // Soporta JSON y x-www-form-urlencoded
  const usuarioRaw  = req.body?.usuario ?? '';
  const passwordRaw = req.body?.password ?? '';

  const usuario  = String(usuarioRaw).trim();
  const password = String(passwordRaw);

  if (!usuario || !password) {
    return res.status(400).json({
      success: false,
      code: 'BAD_REQUEST',
      message: 'Faltan usuario o contraseña'
    });
  }

  try {
    // 👇 Tabla ya renombrada: usuarios_cts
    const { rows } = await pool.query(
      `
      SELECT
        id,
        usuario,
        nombre,
        proveedor,           -- texto del proveedor
        password,
        password_anterior,   -- la nueva columna
        tipo_usuario,
        activo,
        creado,
        modificado
      FROM usuarios_cts
      WHERE UPPER(usuario) = UPPER($1)
      LIMIT 1
      `,
      [usuario]
    );

    const u = rows[0];

    // 🔴 Usuario NO existe
    if (!u) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Usuario o contraseña incorrectos.'
      });
    }

    // 🔴 Usuario INACTIVO
    if (!u.activo) {
      return res.status(403).json({
        success: false,
        code: 'USUARIO_INACTIVO',
        message: 'Usuario inactivo.',
        inactivo: true,
        error: 'USUARIO_INACTIVO'
      });
    }

    // 🔴 Contraseña incorrecta (comparación simple)
    const storedPass = String(u.password ?? '');
    const inputPass  = String(password);

    if (storedPass !== inputPass) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Usuario o contraseña incorrectos.'
      });
    }

    // Ya sabemos que el usuario y la contraseña SON CORRECTOS.
    const rol           = mapRol(u.tipo_usuario);
    const provider_name = u.proveedor || null;
    const provider      = provider_name ? slugify(provider_name) : null;

    // 🔸 Verificar si la contraseña YA EXPIRÓ por fecha "modificado"
    if (isPasswordExpired(u.modificado)) {
      // 👉 NO damos login, solo avisamos al iframe que debe forzar cambio
      return res.status(200).json({
        success: false,
        code: 'PASSWORD_EXPIRED',
        message: 'La contraseña ha expirado, debes actualizarla.',
        passwordExpired: true,
        error: 'PASSWORD_EXPIRED',
        usuario: {
          id: u.id,
          usuario: u.usuario,
          nombre: u.nombre,

          // roles/perfiles
          tipo_usuario: u.tipo_usuario, // original
          rol,                          // normalizado para el front

          // datos de proveedor (para actividades / filtros)
          proveedor: u.proveedor,
          provider,
          provider_name,

          // alias de compatibilidad
          proveedor_slug: provider || null,
          empresa: provider_name || null
        }
      });
    }

    // ✅ Login OK (NO expirada)
    return res.json({
      success: true,
      message: 'Login exitoso',
      usuario: {
        id: u.id,
        usuario: u.usuario,
        nombre: u.nombre,

        // roles/perfiles
        tipo_usuario: u.tipo_usuario, // original
        rol,                          // normalizado para el front

        // datos de proveedor (para actividades / filtros)
        proveedor: u.proveedor,
        provider,
        provider_name,

        // alias de compatibilidad
        proveedor_slug: provider || null,
        empresa: provider_name || null
      }
    });

  } catch (error) {
    console.error('❌ Error en loginUsuarios (apiparametros):', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor'
    });
  }
}
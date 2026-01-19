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

// MISMA REGLA QUE EN EL IFRAME / cambiarPasswordUsuario
const PASSWORD_REGEX =
  /^(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]).{8,}$/;

// ─────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────
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
    // ────────────────────────────────────────
    // 1) PRIMERO: usuarios_cts (sistema central)
    // ────────────────────────────────────────
    const { rows } = await pool.query(
      `
      SELECT
        id,
        usuario,
        nombre,
        proveedor,           -- texto del proveedor
        password,
        password_anterior,   -- columna para saber si ya pasó por cambio
        tipo_usuario,
        activo,
        creado,
        modificado,
        COALESCE(modificado, creado) AS fecha_cambio,
        CASE
          -- Fase 1: nunca ha cambiado (password_anterior IS NULL) → forzar si tiene > 31 días
          WHEN password_anterior IS NULL THEN
            (NOW() - COALESCE(modificado, creado)) > INTERVAL '31 days'

          -- Fase 2: ya cambió al menos una vez → forzar cada día 1 de mes
          ELSE
            (
              NOW()::date = date_trunc('month', NOW())::date          -- es día 1 del mes
              AND COALESCE(modificado, creado)::date < date_trunc('month', NOW())::date
              -- y el último cambio fue antes del 1 de este mes
            )
        END AS password_expirada
      FROM usuarios_cts
      WHERE UPPER(usuario) = UPPER($1)
      LIMIT 1
      `,
      [usuario]
    );

    const u = rows[0];

    // 🔸 Si NO existe en usuarios_cts, probamos en usuarios_actividades
    if (!u) {
      // ────────────────────────────────────────
      // 2) FALLBACK: usuarios_actividades
      // ────────────────────────────────────────
      const actResult = await pool.query(
        `
        SELECT
          id,
          usuario,
          nombre,
          proveedor_id,
          password,
          password_anterior,
          tipo_usuario,
          activo,
          proveedor,           -- texto del proveedor
          created_at,
          updated_at,
          COALESCE(updated_at, created_at) AS fecha_cambio,
          CASE
            -- Fase 1: nunca ha cambiado → forzar si tiene > 31 días
            WHEN password_anterior IS NULL THEN
              (NOW() - COALESCE(updated_at, created_at)) > INTERVAL '31 days'

            -- Fase 2: ya cambió al menos una vez → forzar cada día 1 de mes
            ELSE
              (
                NOW()::date = date_trunc('month', NOW())::date          -- es día 1
                AND COALESCE(updated_at, created_at)::date < date_trunc('month', NOW())::date
              )
          END AS password_expirada
        FROM public.usuarios_actividades
        WHERE LOWER(usuario) = LOWER($1)
        LIMIT 1
        `,
        [usuario]
      );

      const a = actResult.rows[0];

      // 🔴 No existe tampoco en usuarios_actividades
      if (!a) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: 'Usuario o contraseña incorrectos.'
        });
      }

      // 🔴 Usuario INACTIVO en usuarios_actividades
      if (!a.activo) {
        return res.status(403).json({
          success: false,
          code: 'USUARIO_INACTIVO',
          message: 'Usuario inactivo.',
          inactivo: true,
          error: 'USUARIO_INACTIVO'
        });
      }

      // 🔴 Contraseña incorrecta (comparación simple)
      const storedPassA = String(a.password ?? '');
      const inputPassA  = String(password);

      if (storedPassA !== inputPassA) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: 'Usuario o contraseña incorrectos.'
        });
      }

      // ✅ Usuario + password correcto en usuarios_actividades
      const rolA           = mapRol(a.tipo_usuario);
      const providerNameA  = a.proveedor || null;
      const providerSlugA  = providerNameA ? slugify(providerNameA) : null;

      // 🔸 Verificar expiración por tiempo / día 1
      const expiredByTimeA = a.password_expirada === true;
      // 🔸 Verificar si la contraseña actual NO cumple el estándar
      const isWeakA = !PASSWORD_REGEX.test(storedPassA);
      const expiredA = expiredByTimeA || isWeakA;

      if (expiredA) {
        return res.status(200).json({
          success: false,
          code: 'PASSWORD_EXPIRED',
          message: 'La contraseña ha expirado, debes actualizarla.',
          passwordExpired: true,
          error: 'PASSWORD_EXPIRED',
          usuario: {
            id: a.id,
            usuario: a.usuario,
            nombre: a.nombre,

            // roles/perfiles
            tipo_usuario: a.tipo_usuario,
            rol:          rolA,

            // datos de proveedor (para actividades / filtros)
            proveedor:     providerNameA,
            provider:      providerSlugA,
            provider_name: providerNameA,

            // alias de compatibilidad
            proveedor_slug: providerSlugA,
            empresa:        providerNameA
          }
        });
      }

      // ✅ Login OK desde usuarios_actividades (NO expirada / NO débil)
      return res.json({
        success: true,
        message: 'Login exitoso',
        usuario: {
          id: a.id,
          usuario: a.usuario,
          nombre: a.nombre,

          // roles/perfiles
          tipo_usuario: a.tipo_usuario,
          rol:          rolA,

          // datos de proveedor (para actividades / filtros)
          proveedor:     providerNameA,
          provider:      providerSlugA,
          provider_name: providerNameA,

          // alias de compatibilidad
          proveedor_slug: providerSlugA,
          empresa:        providerNameA
        }
      });
    }

    // ────────────────────────────────────────
    // 3) Lógica ORIGINAL de usuarios_cts
    // ────────────────────────────────────────

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

    // 🔸 Verificar expiración por tiempo / día 1
    const expiredByTime = u.password_expirada === true;
    // 🔸 Verificar si la contraseña actual NO cumple el estándar
    const isWeak = !PASSWORD_REGEX.test(storedPass);
    const expired = expiredByTime || isWeak;

    if (expired) {
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
          empresa:        provider_name || null
        }
      });
    }

    // ✅ Login OK (NO expirada / NO débil) desde usuarios_cts
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
        empresa:        provider_name || null
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
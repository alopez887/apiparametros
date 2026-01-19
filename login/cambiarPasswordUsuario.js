// /apiparametros/cambiarPasswordUsuario.js
import pool from '../conexion.js';

// misma regla que en el iframe
const PASSWORD_REGEX =
  /^(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]).{8,}$/;

export default async function cambiarPasswordUsuario(req, res) {
  try {
    // Soporta JSON y x-www-form-urlencoded
    const usuarioRaw        = req.body?.usuario ?? '';
    const passwordActualRaw = req.body?.passwordActual ?? '';
    const passwordNuevaRaw  = req.body?.passwordNueva ?? '';

    const usuario        = String(usuarioRaw).trim();
    const passwordActual = String(passwordActualRaw);
    const passwordNueva  = String(passwordNuevaRaw);

    if (!usuario || !passwordActual || !passwordNueva) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Faltan datos para cambiar la contraseña.'
      });
    }

    // Validar formato de la nueva contraseña
    if (!PASSWORD_REGEX.test(passwordNueva)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_FORMAT',
        message: 'La nueva contraseña no cumple las reglas de seguridad.'
      });
    }

    // ─────────────────────────────────────────────
    // 1) Buscar primero en usuarios_cts
    // ─────────────────────────────────────────────
    const { rows } = await pool.query(
      `
      SELECT id, usuario, password, password_anterior, activo
      FROM usuarios_cts
      WHERE UPPER(usuario) = UPPER($1)
      LIMIT 1
      `,
      [usuario]
    );

    const u = rows[0];

    if (u) {
      // Usuario encontrado en usuarios_cts
      if (!u.activo) {
        return res.status(403).json({
          success: false,
          error: 'USUARIO_INACTIVO',
          message: 'Usuario inactivo.'
        });
      }

      const storedPass = String(u.password ?? '');
      if (storedPass !== String(passwordActual)) {
        return res.status(401).json({
          success: false,
          error: 'INVALID_CURRENT_PASSWORD',
          message: 'La contraseña actual es incorrecta.'
        });
      }

      // Evitar que ponga exactamente la misma
      if (storedPass === passwordNueva) {
        return res.status(400).json({
          success: false,
          error: 'SAME_PASSWORD',
          message: 'La nueva contraseña no puede ser igual a la anterior.'
        });
      }

      // Actualizar contraseña en usuarios_cts
      await pool.query(
        `
        UPDATE usuarios_cts
        SET password_anterior = password,
            password          = $1,
            modificado        = NOW()
        WHERE id = $2
        `,
        [passwordNueva, u.id]
      );

      return res.status(200).json({
        success: true,
        message: 'Contraseña actualizada correctamente.'
      });
    }

    // ─────────────────────────────────────────────
    // 2) Si no existe en usuarios_cts, buscar en usuarios_actividades
    // ─────────────────────────────────────────────
    const actResult = await pool.query(
      `
      SELECT id, usuario, password, password_anterior, activo
      FROM public.usuarios_actividades
      WHERE LOWER(usuario) = LOWER($1)
      LIMIT 1
      `,
      [usuario]
    );

    const a = actResult.rows[0];

    if (!a) {
      // No existe ni en usuarios_cts ni en usuarios_actividades
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'Usuario no encontrado.'
      });
    }

    if (!a.activo) {
      return res.status(403).json({
        success: false,
        error: 'USUARIO_INACTIVO',
        message: 'Usuario inactivo.'
      });
    }

    const storedPassAct = String(a.password ?? '');
    if (storedPassAct !== String(passwordActual)) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CURRENT_PASSWORD',
        message: 'La contraseña actual es incorrecta.'
      });
    }

    if (storedPassAct === passwordNueva) {
      return res.status(400).json({
        success: false,
        error: 'SAME_PASSWORD',
        message: 'La nueva contraseña no puede ser igual a la anterior.'
      });
    }

    // Actualizar contraseña en usuarios_actividades
    await pool.query(
      `
      UPDATE public.usuarios_actividades
      SET password_anterior = password,
          password          = $1,
          updated_at        = NOW()
      WHERE id = $2
      `,
      [passwordNueva, a.id]
    );

    return res.status(200).json({
      success: true,
      message: 'Contraseña actualizada correctamente.'
    });

  } catch (error) {
    console.error('❌ Error en cambiarPasswordUsuario:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Error interno al cambiar la contraseña.'
    });
  }
}

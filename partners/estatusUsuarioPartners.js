// estatusUsuarioPartners.js
import pool from '../conexion.js';

/**
 * 🔹 CAMBIAR ESTATUS ACTIVO DE USUARIO DE ACTIVIDADES
 *   Ruta: PATCH /api/partners/usuarios-partners/:id/estatus
 *   Body: { activo: true|false }  (acepta true/false, "true"/"false", 1/0, "1"/"0")
 */
export async function estatusUsuarioPartners(req, res) {
  const { id } = req.params || {};
  const userId = Number(id);

  console.log('🟦 [API] estatusUsuarioPartners params.id =', id, 'body =', req.body);

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

    // 👀 TABLA CORRECTA: actividades_usuarios
    const sql = `
      UPDATE actividades_usuarios
      SET
        activo = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        usuario,
        nombre,
        proveedor_id,
        password,
        tipo_usuario,
        activo,
        created_at,
        updated_at
    `;

    const params = [nuevoActivo, userId];

    console.log('🟦 [API] estatusUsuarioPartners SQL params:', params);

    const { rows } = await pool.query(sql, params);

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Usuario no encontrado',
      });
    }

    const row = rows[0];
    console.log('✅ [API] estatusUsuarioPartners id:', row.id, 'activo =', row.activo);

    return res.json({
      ok: true,
      usuario: row,
    });
  } catch (err) {
    console.error('❌ [API] estatusUsuarioPartners error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error interno al cambiar estatus del usuario',
    });
  }
}

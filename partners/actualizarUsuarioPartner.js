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

    const nombreTrim  = String(nombre).trim();
    const usuarioTrim = String(usuario).trim();
    const tipoTrim    = String(tipo_usuario).trim();
    const passTrim    = password != null ? String(password).trim() : '';

    if (!nombreTrim || !usuarioTrim || !tipoTrim) {
      return res.status(400).json({
        ok: false,
        message: 'Campos nombre, usuario y tipo_usuario no pueden ir vacíos.',
      });
    }

    let sql;
    let values;

    // ✅ Con password
    if (passTrim !== '') {
      sql = `
        WITH prov AS (
          SELECT nombre
          FROM public.actividades_proveedores
          WHERE id = $2
          LIMIT 1
        ),
        upd AS (
          UPDATE public.actividades_usuarios u
          SET
            nombre       = $1,
            proveedor_id = $2,
            proveedor    = (SELECT prov.nombre FROM prov),
            tipo_usuario = $3,
            usuario      = $4,
            password     = $5,
            updated_at   = NOW()
          WHERE u.id = $6
            AND EXISTS (SELECT 1 FROM prov)
          RETURNING
            id,
            nombre,
            proveedor_id,
            proveedor,
            tipo_usuario,
            usuario,
            activo,
            created_at,
            updated_at
        )
        SELECT * FROM upd;
      `;

      values = [
        nombreTrim,
        provId,
        tipoTrim,
        usuarioTrim,
        passTrim,
        id,
      ];
    } else {
      // ✅ Sin password
      sql = `
        WITH prov AS (
          SELECT nombre
          FROM public.actividades_proveedores
          WHERE id = $2
          LIMIT 1
        ),
        upd AS (
          UPDATE public.actividades_usuarios u
          SET
            nombre       = $1,
            proveedor_id = $2,
            proveedor    = (SELECT prov.nombre FROM prov),
            tipo_usuario = $3,
            usuario      = $4,
            updated_at   = NOW()
          WHERE u.id = $5
            AND EXISTS (SELECT 1 FROM prov)
          RETURNING
            id,
            nombre,
            proveedor_id,
            proveedor,
            tipo_usuario,
            usuario,
            activo,
            created_at,
            updated_at
        )
        SELECT * FROM upd;
      `;

      values = [
        nombreTrim,
        provId,
        tipoTrim,
        usuarioTrim,
        id,
      ];
    }

    const { rows } = await pool.query(sql, values);

    // Si no regresó filas: puede ser usuario no existe O proveedor_id no existe
    if (!rows.length) {
      const checkUser = await pool.query(
        `SELECT 1 FROM public.actividades_usuarios WHERE id = $1 LIMIT 1`,
        [id]
      );

      if (!checkUser.rows.length) {
        return res.status(404).json({
          ok: false,
          message: 'Usuario no encontrado.',
        });
      }

      return res.status(400).json({
        ok: false,
        message: 'proveedor_id no existe en actividades_proveedores.',
      });
    }

    return res.json({
      ok: true,
      row: rows[0],
    });

  } catch (err) {
    // ✅ Usuario duplicado (UNIQUE usuario)
    if (err && err.code === '23505') {
      return res.status(409).json({
        ok: false,
        message: 'El usuario ya existe, favor de verificar.',
      });
    }

    console.error('❌ actualizarUsuarioPartner:', err);
    return res.status(500).json({
      ok: false,
      message: 'Error interno al actualizar el usuario.',
    });
  }
}

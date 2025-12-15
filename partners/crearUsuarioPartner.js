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

    // ✅ Inserción guardando también el texto del proveedor desde actividades_proveedores.nombre
    // Si proveedor_id no existe en catálogo, NO inserta (y regresamos 400).
    const sql = `
      WITH prov AS (
        SELECT nombre
        FROM public.actividades_proveedores
        WHERE id = $2
        LIMIT 1
      ),
      ins AS (
        INSERT INTO public.actividades_usuarios
          (nombre, proveedor_id, proveedor, tipo_usuario, usuario, password, activo, created_at, updated_at)
        SELECT
          $1, $2, prov.nombre, $3, $4, $5, TRUE, NOW(), NOW()
        FROM prov
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
      SELECT * FROM ins;
    `;

    const values = [
      nombreTrim,
      provId,
      tipoTrim,
      usuarioTrim,
      passwordTrim,
    ];

    const { rows } = await pool.query(sql, values);

    // Si no insertó, es porque no existe ese proveedor_id en el catálogo
    if (!rows || rows.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'proveedor_id no existe en actividades_proveedores.',
      });
    }

    return res.status(201).json({
      ok: true,
      row: rows[0],
    });
  } catch (err) {
    console.error('❌ crearUsuarioPartner:', err);

    // ✅ usuario duplicado (UNIQUE usuario)
    if (err && err.code === '23505' && err.constraint === 'actividades_usuarios_usuario_key') {
      return res.status(409).json({
        ok: false,
        message: 'El usuario ya existe, favor de verificar.',
      });
    }

    return res.status(500).json({
      ok: false,
      message: 'Error interno al crear el usuario.',
    });
  }
}

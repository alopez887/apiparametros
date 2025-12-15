// /partners/crearUsuarioPartner.js
import pool from '../conexion.js';

export async function crearUsuarioPartner(req, res) {
  // ✅ definimos trims afuera para poder usarlos también en catch (sin “adivinar”)
  const body = req.body || {};
  const nombreRaw = body.nombre;
  const proveedorIdRaw = body.proveedor_id;
  const tipoRaw = body.tipo_usuario;
  const usuarioRaw = body.usuario;
  const passwordRaw = body.password;

  const nombreTrim   = nombreRaw != null ? String(nombreRaw).trim() : '';
  const usuarioTrim  = usuarioRaw != null ? String(usuarioRaw).trim() : '';
  const tipoTrim     = tipoRaw != null ? String(tipoRaw).trim() : '';
  const passwordTrim = passwordRaw != null ? String(passwordRaw).trim() : '';

  try {
    // 🔹 Validaciones básicas
    if (!nombreTrim || !proveedorIdRaw || !tipoTrim || !usuarioTrim) {
      return res.status(400).json({
        ok: false,
        message: 'Faltan campos obligatorios (nombre, proveedor_id, tipo_usuario, usuario).',
      });
    }

    const provId = Number(proveedorIdRaw);
    if (!Number.isFinite(provId) || provId <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'proveedor_id inválido.',
      });
    }

    // ✅ Inserción guardando también el texto del proveedor desde actividades_proveedores.nombre
    // Si proveedor_id no existe en catálogo, NO inserta.
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
    // ✅ Usuario duplicado (UNIQUE usuario)
    if (err && err.code === '23505') {
      return res.status(409).json({
        ok: false,
        // ⬇️ mandamos HTML para que el front lo pueda mostrar en negritas
        message: `El usuario <strong>${usuarioTrim}</strong> ya existe, favor de verificar.`,
      });
    }

    console.error('❌ crearUsuarioPartner:', err);
    return res.status(500).json({
      ok: false,
      message: 'Error interno al crear el usuario.',
    });
  }
}

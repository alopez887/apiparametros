// correosReservacionPreview.js
import pool from './conexion.js';
import { buildPreviewActividadesFromReserva } from './correoActividadesPreview.js';

/**
 * Enriquecer reserva con datos del proveedor (si existe).
 * Usa la columna `proveedor` de la tabla `reservaciones` como NOMBRE,
 * y busca en la tabla `actividades_proveedores.nombre`.
 */
export async function enriquecerReservaConProveedor(reserva) {
  if (!reserva) return reserva;

  // Si ya trae nombre + (email o teléfono) de proveedor, no tocamos nada
  if (
    reserva.proveedor_nombre &&
    (reserva.proveedor_email || reserva.proveedor_telefono)
  ) {
    return reserva;
  }

  // Aquí usamos EXACTAMENTE la columna que tienes en `reservaciones`
  const nombreProv = (reserva.proveedor || '').trim();
  if (!nombreProv) {
    return reserva;
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        nombre           AS proveedor_nombre,
        email_contacto   AS proveedor_email,
        telefono_contacto AS proveedor_telefono
      FROM actividades_proveedores
      WHERE nombre = $1
      LIMIT 1
      `,
      [nombreProv]
    );

    if (rows && rows.length > 0) {
      const prov = rows[0];
      return {
        ...reserva,
        proveedor_nombre:   prov.proveedor_nombre || nombreProv,
        proveedor_email:    prov.proveedor_email || '',
        proveedor_telefono: prov.proveedor_telefono || '',
      };
    }
  } catch (err) {
    console.warn('⚠️ No se pudo enriquecer reserva con proveedor:', err?.message);
  }

  // Si no se encontró en la tabla, al menos aseguramos proveedor_nombre
  if (!reserva.proveedor_nombre && nombreProv) {
    return {
      ...reserva,
      proveedor_nombre: nombreProv,
    };
  }

  return reserva;
}

// ============================================================================
// Handler HTTP: previewCorreoReservacion
// ============================================================================

export async function previewCorreoReservacion(req, res) {
  try {
    const folio =
      req.method === 'GET'
        ? (req.query.folio || req.query.id || '').trim()
        : (req.body.folio || '').trim();

    if (!folio) {
      return res.status(400).json({
        ok: false,
        error: 'Falta parámetro folio',
      });
    }

    const { rows } = await pool.query(
      `
      SELECT
        *
      FROM reservaciones
      WHERE folio = $1
      LIMIT 1
      `,
      [folio]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'No se encontró reservación con ese folio',
      });
    }

    let reserva = rows[0];

    // 🔹 Enriquecer con datos del proveedor usando `reservaciones.proveedor`
    //     -> actividades_proveedores.nombre
    reserva = await enriquecerReservaConProveedor(reserva);

    const tipoServicio = (reserva.tipo_servicio || '').toLowerCase();

    let subject = null;
    let html    = null;

    // ACTIVIDADES -> usamos el layout de correoActividadesPreview.js
    if (tipoServicio === 'actividad' || tipoServicio === 'actividades') {
      const built = buildPreviewActividadesFromReserva(reserva);
      subject = built.subject;
      html    = built.html;
    }

    return res.json({
      ok: true,
      folio,
      tipo_servicio: reserva.tipo_servicio || null,
      idioma: reserva.idioma || null,
      reserva,
      subject,
      html,
    });
  } catch (err) {
    console.error('❌ previewCorreoReservacion:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error al obtener datos para vista previa del correo',
    });
  }
}

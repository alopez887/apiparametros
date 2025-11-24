// correosReservacionPreview.js
import pool from './conexion.js';
import { buildPreviewActividadesFromReserva } from './correoActividadesPreview.js';

/**
 * Enriquecer reserva con datos del proveedor (si existe).
 * Lo separamos para reuso en preview + envío.
 */
export async function enriquecerReservaConProveedor(reserva) {
  if (!reserva || !reserva.proveedor_codigo) return reserva;
  try {
    const { rows } = await pool.query(
      `
      SELECT
        codigo,
        nombre       AS proveedor_nombre,
        email        AS proveedor_email,
        telefono     AS proveedor_telefono
      FROM proveedores
      WHERE codigo = $1
      LIMIT 1
      `,
      [reserva.proveedor_codigo]
    );
    if (rows && rows.length > 0) {
      const prov = rows[0];
      return {
        ...reserva,
        proveedor_nombre: prov.proveedor_nombre,
        proveedor_email: prov.proveedor_email,
        proveedor_telefono: prov.proveedor_telefono,
      };
    }
  } catch (err) {
    console.warn('⚠️ No se pudo enriquecer reserva con proveedor:', err?.message);
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

    // Enriquecer con datos del proveedor (genérico)
    reserva = await enriquecerReservaConProveedor(reserva);

    const tipoServicio = (reserva.tipo_servicio || '').toLowerCase();

    let subject = null;
    let html    = null;

    // Por ahora, preview "bonita" solo para Actividades.
    if (
      tipoServicio === 'actividad'   ||
      tipoServicio === 'actividades'
    ) {
      const built = buildPreviewActividadesFromReserva(reserva);
      subject = built.subject;
      html    = built.html;
    }

    // En el futuro:
    // else if (tipoServicio === 'transporte' || tipoServicio === 'transportacion') {
    //   const built = buildPreviewTransporteFromReserva(reserva);
    //   subject = built.subject;
    //   html    = built.html;
    // }

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

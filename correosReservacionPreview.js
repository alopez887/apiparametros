// correosReservacionPreview.js
import pool from './conexion.js';
import { buildPreviewActividadesFromReserva } from './correoActividadesPreview.js';
import { buildPreviewTransporteFromReserva } from './correoTransportePreview.js'; // 🔹 NUEVO

// ... enriquecerReservaConProveedor se queda IGUAL (solo actividades) ...

export async function enriquecerReservaConProveedor(reserva) {
  try {
    const folio =
      req.method === 'GET'
        ? (req.query.folio || req.query.id || '').trim()
        : (req.body.folio || '').trim();

    if (!folio) {
      return res.status(400).json({ ok: false, error: 'Falta parámetro folio' });
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

    // 🔹 Enriquecer SOLO para actividades (proveedor, etc.)
    reserva = await enriquecerReservaConProveedor(reserva);

    const tipoServicio = (reserva.tipo_servicio || '').toLowerCase();

    let subject = null;
    let html    = null;

    if (tipoServicio === 'actividad' || tipoServicio === 'actividades') {
      const built = buildPreviewActividadesFromReserva(reserva);
      subject = built.subject;
      html    = built.html;

    } else if (tipoServicio === 'transportacion' || tipoServicio === 'transporte') {
      // 🔹 PREVIEW TRANSPORTE con QR generado desde token_qr
      const built = await buildPreviewTransporteFromReserva(reserva);
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

// correosReservacionEnviar.js
import pool from './conexion.js';
import {
  buildPreviewActividadesFromReserva,
  enriquecerReservaConProveedor,
} from './correosReservacionPreview.js';

const GAS_URL        = process.env.GAS_URL;        // WebApp GAS que envía los correos
const GAS_TOKEN      = process.env.GAS_TOKEN;      // Token secreto que valida la petición
const GAS_TIMEOUT_MS = Number(process.env.GAS_TIMEOUT_MS || 15000);

/**
 * POST /api/correos-reservacion-error/enviar
 * Body esperado: { folio }
 *
 * Flujo:
 *  1) Buscar la reservación por folio
 *  2) Validar que email_reservacion != 'enviado'
 *  3) Construir subject + html EXACTAMENTE igual que la vista previa de ACTIVIDADES
 *  4) Llamar a GAS_URL con el payload
 *  5) Si GAS responde ok, actualizar email_reservacion = 'enviado'
 *  6) Devolver resultado
 */

export async function reenviarCorreoReservacion(req, res) {
  try {
    const folio = String(req.body?.folio || '').trim();
    if (!folio) {
      return res.status(400).json({
        ok: false,
        error: 'Falta parámetro folio en el body',
      });
    }

    // 1) Buscar reservación
    const { rows } = await pool.query(
      `
      SELECT *
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

    // 2) Enriquecer con datos del proveedor (igual que en el preview)
    reserva = await enriquecerReservaConProveedor(reserva);

    const tipoServicio = (reserva.tipo_servicio || '').toLowerCase();

    // Por ahora: solo ACTIVIDADES soportadas en este módulo.
    if (
      tipoServicio !== 'actividad' &&
      tipoServicio !== 'actividades'
    ) {
      console.warn('[REENVIO] Tipo de servicio no soportado para reenvío:', tipoServicio);
      return res.status(400).json({
        ok: false,
        error: `Tipo de servicio no soportado para reenvío: ${tipoServicio || '(vacío)'}`,
      });
    }

    // 3) Construir subject + html EXACTAMENTE como la vista previa
    const { subject, html } = buildPreviewActividadesFromReserva(reserva);

    const emailTo = (reserva.correo_cliente || '').trim();
    if (!emailTo) {
      return res.status(400).json({
        ok: false,
        error: 'La reservación no tiene correo_cliente',
      });
    }

    // 🔹 NUEVO: armar CC con el correo del proveedor (si existe)
    let cc = undefined;
    const provEmailRaw = (reserva.proveedor_email || '').trim();
    if (provEmailRaw) {
      cc = provEmailRaw;
    }

    if (!subject || !html) {
      return res.status(400).json({
        ok: false,
        error: 'No se pudo construir el contenido del correo para esta reservación',
      });
    }

    // 4) Llamar a GAS_URL con el payload
    const payloadGAS = {
      token:  GAS_TOKEN,
      folio:  reserva.folio,
      to:     emailTo,
      cc,                    // puede ser undefined
      subject,
      html,
      // Opcional: metadata para logs en GAS
      tipoServicio: reserva.tipo_servicio,  // 'actividad' | otros
      idioma:       reserva.idioma || 'es',
    };

    console.log('[REENVIO] Enviando correo a GAS →', GAS_URL, {
      folio:  payloadGAS.folio,
      to:     payloadGAS.to,
      cc:     payloadGAS.cc || null,
      tipo:   payloadGAS.tipoServicio,
      idioma: payloadGAS.idioma,
    });

    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), GAS_TIMEOUT_MS);

    let gasRes;
    try {
      gasRes = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadGAS),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('❌ Error al llamar GAS para reenviar correo:', err);
      return res.status(502).json({
        ok: false,
        error: 'No se pudo contactar el servicio de envío de correos (GAS)',
      });
    }
    clearTimeout(timeoutId);

    let gasJson = null;
    try {
      gasJson = await gasRes.json();
    } catch {
      gasJson = null;
    }

    if (!gasRes.ok || !gasJson || !gasJson.ok) {
      console.error('❌ GAS respondió error al reenviar correo:', gasJson || gasRes.status);
      return res.status(502).json({
        ok: false,
        error: 'El servicio de envío de correos respondió con error',
        detalle: gasJson || { status: gasRes.status, statusText: gasRes.statusText },
      });
    }

    // 5) Actualizar email_reservacion = 'enviado'
    const updateSql = `
      UPDATE reservaciones
      SET email_reservacion = 'enviado'
      WHERE folio = $1
      RETURNING email_reservacion
    `;
    const { rows: updRows } = await pool.query(updateSql, [folio]);
    const updated = updRows?.[0] || null;

    // 6) Responder ok
    return res.json({
      ok: true,
      folio,
      email_reservacion: updated?.email_reservacion || 'enviado',
      gas: gasJson,
    });
  } catch (err) {
    console.error('❌ reenviarCorreoReservacion:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error interno al reenviar correo',
    });
  }
}

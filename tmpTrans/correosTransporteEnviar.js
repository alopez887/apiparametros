// correoTransporte/correosTransporteEnviar.js   
import pool from '../conexion.js';
import { buildPreviewTransporteFromReserva } from './correosTransportePreview.js';
import { generarQRTransporte } from '../generarQRTransporte.js';

const GAS_URL        = process.env.GAS_URL;
const GAS_TOKEN      = process.env.GAS_TOKEN;
const GAS_TIMEOUT_MS = Number(process.env.GAS_TIMEOUT_MS || 15000);

/**
 * POST /api/correos-reservacion-error/enviar-transporte
 * Body esperado: { folio }
 *
 * Flujo (SOLO TRANSPORTE):
 *  1) Buscar la reservación por folio
 *  2) Validar que tipo_servicio sea TRANSPORTE/TRANSPORTACION
 *  3) Generar QR (si hace falta) usando generarQRTransporte
 *  4) Construir subject + html con el layout de transporte (preview builder)
 *  5) Llamar a GAS_URL con el payload
 *  6) Si GAS responde ok, actualizar email_reservacion = 'enviado'
 *  7) Devolver resultado
 */
export async function reenviarCorreoTransporte(req, res) {
  try {
    const folio = String(req.body?.folio || '').trim();
    if (!folio) {
      return res.status(400).json({
        ok: false,
        error: 'Falta parámetro folio en el body',
      });
    }

    if (!GAS_URL || !/^https:\/\/script\.google\.com\/macros\/s\//.test(GAS_URL)) {
      console.error('❌ GAS_URL no configurado o inválido');
      return res.status(500).json({
        ok: false,
        error: 'Servicio de envío de correos no configurado (GAS_URL)',
      });
    }
    if (!GAS_TOKEN) {
      console.error('❌ GAS_TOKEN no configurado');
      return res.status(500).json({
        ok: false,
        error: 'Servicio de envío de correos no configurado (GAS_TOKEN)',
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

    const tipoServicio = (reserva.tipo_servicio || '').toLowerCase().trim();
    console.log('[REENVIO-TRANS] folio=', folio, 'tipo_servicio=', tipoServicio, 'idioma=', reserva.idioma);

    // 2) Validar que sea TRANSPORTE
    if (tipoServicio !== 'transporte' && tipoServicio !== 'transportacion') {
      console.warn('[REENVIO-TRANS] Tipo de servicio NO es transporte:', tipoServicio);
      return res.status(400).json({
        ok: false,
        error: `Tipo de servicio no soportado por este endpoint (solo transporte): ${tipoServicio || '(vacío)'}`,
      });
    }

    // 3) Generar QR si no viene ya en la fila
    try {
      if (!reserva.qr) {
        const token = reserva.token_qr || reserva.token || null;
        if (token) {
          const qrDataUrl = await generarQRTransporte(token);
          reserva = { ...reserva, qr: qrDataUrl };
        }
      }
    } catch (qrErr) {
      console.warn('[REENVIO-TRANS] No se pudo generar QR, se continúa sin QR:', qrErr?.message);
      // No detenemos el envío solo por QR
    }

    const emailTo = (reserva.correo_cliente || '').trim();
    if (!emailTo) {
      return res.status(400).json({
        ok: false,
        error: 'La reservación no tiene correo_cliente',
      });
    }

    // 4) Construir subject + html usando el mismo diseño que la vista previa
    const built = await buildPreviewTransporteFromReserva(reserva);
    const subject = built.subject;
    const html    = built.html;

    if (!subject || !html) {
      console.error('[REENVIO-TRANS] subject/html vacío para folio=', folio, 'subject=', subject);
      return res.status(400).json({
        ok: false,
        error: 'No se pudo construir el contenido del correo para esta reservación de transporte',
      });
    }

    console.log('[REENVIO-TRANS] subject=', subject);

    // 5) Llamar a GAS_URL con el payload
    const payloadGAS = {
      token:  GAS_TOKEN,
      ts:     Date.now(),
      folio:  reserva.folio,
      to:     emailTo,
      // Para transporte NO estamos usando CC especial aquí
      subject,
      html,
      tipoServicio: reserva.tipo_servicio,   // 'transporte' | 'transportacion'
      idioma:       reserva.idioma || 'es',
      // attachments: []  // para este reenvío usamos imágenes por URL en el HTML
    };

    console.log('[REENVIO-TRANS] Enviando correo a GAS →', GAS_URL, {
      folio:   payloadGAS.folio,
      to:      payloadGAS.to,
      tipo:    payloadGAS.tipoServicio,
      idioma:  payloadGAS.idioma,
      subject: payloadGAS.subject,
    });

    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), GAS_TIMEOUT_MS);

    let gasRes;
    try {
      gasRes = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payloadGAS),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('❌ Error al llamar GAS para reenviar correo (TRANS):', err);
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
      console.error('❌ GAS respondió error al reenviar correo (TRANS):', gasJson || gasRes.status);
      return res.status(502).json({
        ok: false,
        error: 'El servicio de envío de correos respondió con error',
        detalle: gasJson || { status: gasRes.status, statusText: gasRes.statusText },
      });
    }

    // 6) Actualizar email_reservacion = 'enviado'
    const updateSql = `
      UPDATE reservaciones
      SET email_reservacion = 'enviado'
      WHERE folio = $1
      RETURNING email_reservacion
    `;
    const { rows: updRows } = await pool.query(updateSql, [folio]);
    const updated = updRows?.[0] || null;

    // 7) Responder ok
    return res.json({
      ok: true,
      folio,
      email_reservacion: updated?.email_reservacion || 'enviado',
      gas: gasJson,
    });
  } catch (err) {
    console.error('❌ reenviarCorreoTransporte:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error interno al reenviar correo de transporte',
    });
  }
}

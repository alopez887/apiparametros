// correoActividades/correoActividadesEnviar.js
import pool from '../conexion.js';
import { buildPreviewActividadesFromReserva } from './correoActividadesPreview.js';
import { enriquecerReservaConProveedor } from '../correosReservacionPreview.js';

const GAS_URL        = process.env.GAS_URL;        // WebApp GAS que envía los correos
const GAS_TOKEN      = process.env.GAS_TOKEN;      // Token secreto que valida la petición
const GAS_TIMEOUT_MS = Number(process.env.GAS_TIMEOUT_MS || 15000);

/**
 * POST /api/correos-reservacion-error/enviar
 * Body esperado: { folio }
 *
 * Flujo (SOLO ACTIVIDADES):
 *  1) Buscar la reservación por folio
 *  2) Enriquecer con proveedor (si aplica)
 *  3) Validar que tipo_servicio sea ACTIVIDAD/ACTIVIDADES
 *  4) Construir subject + html con layout de actividades + CC al proveedor
 *  5) Llamar a GAS_URL con el payload
 *  6) Si GAS responde ok, actualizar email_reservacion = 'enviado'
 *  7) Devolver resultado
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
    console.log('[REENVIO-ACT] folio=', folio, 'tipo_servicio=', tipoServicio, 'idioma=', reserva.idioma);

    // 3) Validar que sea ACTIVIDAD/ACTIVIDADES
    if (tipoServicio !== 'actividad' && tipoServicio !== 'actividades') {
      console.warn('[REENVIO-ACT] Tipo de servicio NO es actividad:', tipoServicio);
      return res.status(400).json({
        ok: false,
        error: `Tipo de servicio no soportado por este endpoint (solo actividades): ${tipoServicio || '(vacío)'}`,
      });
    }

    // 4) Construir subject + html para ACTIVIDADES
    let subject = null;
    let html    = null;
    let cc      = undefined; // solo se usa para ACTIVIDADES

    const built = await buildPreviewActividadesFromReserva(reserva);
    subject = built.subject;
    html    = built.html;

    console.log('[REENVIO-ACT] ACTIVIDAD subject=', subject);

    // CC al correo del proveedor si existe (igual que antes)
    const provEmailRaw = (reserva.proveedor_email || '').trim();
    if (provEmailRaw) {
      cc = provEmailRaw;
    }

    const emailTo = (reserva.correo_cliente || '').trim();
    if (!emailTo) {
      return res.status(400).json({
        ok: false,
        error: 'La reservación no tiene correo_cliente',
      });
    }

    if (!subject || !html) {
      console.error('[REENVIO-ACT] subject/html vacío para folio=', folio, 'subject=', subject);
      return res.status(400).json({
        ok: false,
        error: 'No se pudo construir el contenido del correo para esta reservación',
      });
    }

    // 5) Llamar a GAS_URL con el payload
    const payloadGAS = {
      token:  GAS_TOKEN,
      folio:  reserva.folio,
      to:     emailTo,
      cc,                    // puede ser undefined; depende de si hay proveedor
      subject,
      html,
      // Opcional: metadata para logs en GAS
      tipoServicio: reserva.tipo_servicio,  // 'actividad' | 'Actividades'
      idioma:       reserva.idioma || 'es',
    };

    console.log('[REENVIO-ACT] Enviando correo a GAS →', GAS_URL, {
      folio:   payloadGAS.folio,
      to:      payloadGAS.to,
      cc:      payloadGAS.cc || null,
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
      console.error('❌ Error al llamar GAS para reenviar correo (ACT):', err);
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
      console.error('❌ GAS respondió error al reenviar correo (ACT):', gasJson || gasRes.status);
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
    console.error('❌ reenviarCorreoReservacion (ACT):', err);
    return res.status(500).json({
      ok: false,
      error: 'Error interno al reenviar correo',
    });
  }
}

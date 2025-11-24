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
 *  1) Busca la reservación por folio.
 *  2) Enriquecer con datos del proveedor (igual que preview).
 *  3) Construir subject + html usando el mismo builder que la vista previa.
 *  4) Llamar a GAS para enviar el correo.
 *  5) SOLO SI GAS responde OK → marcar email_reservacion = 'enviado'.
 */
export async function reenviarCorreoReservacion(req, res) {
  try {
    const { folio } = req.body || {};

    if (!folio) {
      return res.status(400).json({
        ok: false,
        error: 'Falta parámetro: folio',
      });
    }

    if (!GAS_URL || !GAS_TOKEN) {
      console.error('[REENVIO] Falta GAS_URL o GAS_TOKEN en .env');
      return res.status(500).json({
        ok: false,
        error: 'Configuración de correo incompleta (GAS_URL / GAS_TOKEN)',
      });
    }

    // 1) Leer reservación de la BD
    const sql = `
      SELECT *
      FROM reservaciones
      WHERE folio = $1
      LIMIT 1
    `;
    const { rows } = await pool.query(sql, [folio]);

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        error: 'No se encontró una reservación con ese folio',
      });
    }

    let reserva = rows[0];

    // 2) Enriquecer con datos del proveedor (igual que en el preview)
    reserva = await enriquecerReservaConProveedor(reserva);

    const tipoServicio = (reserva.tipo_servicio || '').toLowerCase();

    // Por ahora: solo actividades/tours (igual que el preview bonito)
    if (
      tipoServicio !== 'actividad' &&
      tipoServicio !== 'actividades' &&
      tipoServicio !== 'tour' &&
      tipoServicio !== 'tours'
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

    // 4) Llamar a GAS para enviar el correo
    // 👇 OJO: NO mandamos `folio` para no activar la idempotencia del GAS.
    const payloadGAS = {
      token:        GAS_TOKEN,
      tipo:         'reservacion',        // dejamos el mismo tipo clásico
      // folio:     <<< NO lo mandamos a GAS en el reenvío
      folioCorreo:  reserva.folio,        // solo para referencia si luego quieres verlo en logs del GAS
      tipoServicio: reserva.tipo_servicio,
      idioma:       reserva.idioma || 'es',
      to:           emailTo,
      subject,
      html,
      ts:           Date.now(),           // por si activas ENFORCE_TS_SEC en el futuro
    };

    console.log('[REENVIO] Enviando correo a GAS →', GAS_URL, {
      folio: reserva.folio,
      to:    payloadGAS.to,
      tipo:  payloadGAS.tipo,
      idioma:payloadGAS.idioma,
    });

    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), GAS_TIMEOUT_MS);

    let gasRes;
    try {
      gasRes = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify(payloadGAS),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('❌ [REENVIO] Error de red al llamar a GAS:', err);
      return res.status(502).json({
        ok: false,
        error: 'No se pudo contactar al servicio de correo (GAS)',
      });
    }

    clearTimeout(timeoutId);

    let gasJson = {};
    try {
      gasJson = await gasRes.json();
    } catch (_) {
      gasJson = {};
    }

    console.log('[REENVIO] Respuesta GAS:', gasRes.status, gasJson);

    if (!gasRes.ok || gasJson.ok === false) {
      const msg = gasJson.error || gasJson.message || `HTTP ${gasRes.status}`;
      console.error('❌ [REENVIO] GAS respondió error:', msg, gasJson);
      return res.status(502).json({
        ok: false,
        error: 'El servicio de correo (GAS) no pudo enviar el correo',
        detalle: msg,
      });
    }

    // 5) SOLO si GAS dice OK → marcar email_reservacion = 'enviado'
    const updSql = `
      UPDATE reservaciones
      SET email_reservacion = 'enviado'
      WHERE folio = $1
      RETURNING folio, email_reservacion
    `;
    const { rows: updRows } = await pool.query(updSql, [folio]);
    const updated = updRows[0] || null;

    console.log('[REENVIO] Reservación actualizada a "enviado":', updated);

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

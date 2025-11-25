// correoTransporte/correosTransportePreview.js
import { generarQRTransporte } from './generarQRTransporte.js';

/* ============ Utilidades básicas ============ */

function sanitizeUrl(u = '') {
  try {
    let s = String(u || '').trim();
    if (!s) return '';
    if (s.startsWith('//')) s = 'https:' + s;
    if (s.startsWith('http://')) s = s.replace(/^http:\/\//i, 'https://');
    return s;
  } catch {
    return '';
  }
}

// Forzar JPG en Wix para evitar WEBP en clientes
function forceJpgIfWix(url = '') {
  try {
    const u = new URL(url);
    if (/wixstatic\.com$/i.test(u.hostname)) {
      if (!u.searchParams.has('format')) u.searchParams.set('format', 'jpg');
      if (!u.searchParams.has('width')) u.searchParams.set('width', '1200');
      return u.toString();
    }
  } catch {}
  return url;
}

const safeToFixed = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

function formatoHora12(hora) {
  if (!hora) return '';
  // puede venir "HH:MM" o Date
  if (hora instanceof Date) {
    const h = hora.getHours();
    const m = hora.getMinutes();
    const suf = h >= 12 ? 'p.m.' : 'a.m.';
    const h12 = (h % 12) || 12;
    const mm = String(m).padStart(2, '0');
    return `${h12}:${mm} ${suf}`;
  }
  const [hStr, mStr = '00'] = String(hora).split(':');
  const H = parseInt(hStr, 10);
  if (Number.isNaN(H)) return String(hora);
  const suf = H >= 12 ? 'p.m.' : 'a.m.';
  const h12 = (H % 12) || 12;
  return `${h12}:${mStr} ${suf}`;
}

function formatCurrency(monto, moneda) {
  const val = safeToFixed(monto);
  return `$${val} ${moneda === 'MXN' ? 'MXN' : 'USD'}`;
}

// 👉 AQUÍ formateamos la fecha como dd/mm/aaaa
function formatFechaDMY(value) {
  if (!value) return '';
  let d;
  if (value instanceof Date) {
    d = value;
  } else {
    d = new Date(value);
  }
  if (Number.isNaN(d.getTime())) return String(value);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/* ============ i18n ============ */

function pickLang(idioma) {
  const es = String(idioma || '').toLowerCase().startsWith('es');
  if (es) {
    return {
      code: 'es',
      header_ok: '✅ Reservación de transporte confirmada',
      labels: {
        name: 'Nombre',
        email: 'Correo',
        phone: 'Teléfono',
        passengers: 'Pasajeros',
        note: 'Nota',
        folio: 'Folio',
        transport: 'Transporte',
        capacity: 'Capacidad',
        total: 'Total',
        tripType: 'Tipo de viaje',
        hotel: 'Hotel',
        date: 'Fecha',
        time: 'Hora',
        airline: 'Aerolínea',
        flight: 'Vuelo',
        arrivalInfo: 'Información de Llegada',
        departureInfo: 'Información de Salida',
        qrLegend: 'Muestra este código QR a tu proveedor:',
        sentTo: 'Esta confirmación fue enviada a:',
      },
      tripType: {
        Llegada: 'Llegada',
        Salida: 'Salida',
        Redondo: 'Viaje Redondo',
        Shuttle: 'Shuttle',
      },
      recomendaciones: `
        <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:8px 12px;margin-top:14px;border-radius:5px;line-height:1.3;">
          <strong style="color:#b00000;">⚠ Recomendaciones:</strong>
          <span style="color:#333;"> Por favor confirma tu reservación con al menos 24 horas de anticipación para evitar contratiempos.</span>
        </div>
      `,
      politicas: `
        <div style="margin-top:30px;padding-top:15px;border-top:1px solid #ccc;font-size:13px;color:#555;">
          <strong>&#128204; Políticas de cancelación:</strong><br>
          - Toda cancelación o solicitud de reembolso está sujeta a una penalización del 10% del monto pagado.<br>
          <strong>- No hay reembolsos por cancelaciones con menos de 24 horas de anticipación o por inasistencias (no-show).</strong>
        </div>
      `,
      subject: (folio) => `Confirmación de Transporte - Folio ${folio}`,
    };
  }

  // EN
  return {
    code: 'en',
    header_ok: '✅ Transport reservation confirmed',
    labels: {
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      passengers: 'Passengers',
      note: 'Note',
      folio: 'Folio',
      transport: 'Transport',
      capacity: 'Capacity',
      total: 'Total',
      tripType: 'Trip Type',
      hotel: 'Hotel',
      date: 'Date',
      time: 'Time',
      airline: 'Airline',
      flight: 'Flight',
      arrivalInfo: 'Arrival information',
      departureInfo: 'Departure information',
      qrLegend: 'Show this QR code to your provider:',
      sentTo: 'This confirmation was sent to:',
    },
    tripType: {
      Llegada: 'Arrival',
      Salida: 'Departure',
      Redondo: 'Round Trip',
      Shuttle: 'Shuttle',
    },
    recomendaciones: `
      <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:8px 12px;margin-top:14px;border-radius:5px;line-height:1.3;">
        <strong style="color:#b00000;">⚠ Recommendations:</strong>
        <span style="color:#333;"> Please confirm your reservation at least 24 hours in advance to avoid any inconvenience.</span>
      </div>
    `,
    politicas: `
      <div style="margin-top:30px;padding-top:15px;border-top:1px solid #ccc;font-size:13px;color:#555;">
        <strong>&#128204; Cancellation policy:</strong><br>
        - All cancellations or refund requests are subject to a 10% fee of the total amount paid.<br>
        <strong>- No refunds will be issued for cancellations made less than 24 hours in advance or in case of no-shows.</strong>
      </div>
    `,
    subject: (folio) => `Transport reservation - Folio ${folio}`,
  };
}

/* ============ Builder principal (preview + reenvío) ============ */

export async function buildPreviewTransporteFromReserva(reserva) {
  if (!reserva) {
    return { subject: null, html: null };
  }

  // Normalizamos fechas a dd/mm/aaaa
  const fecha_llegada = formatFechaDMY(reserva.fecha_llegada);
  const fecha_salida  = formatFechaDMY(reserva.fecha_salida);

  // Horas pueden venir como texto HH:MM o Date; usamos helper 12h
  const hora_llegada = reserva.hora_llegada
    ? formatoHora12(reserva.hora_llegada)
    : '';
  const hora_salida = reserva.hora_salida
    ? formatoHora12(reserva.hora_salida)
    : '';

  // QR: usamos el que ya tenga la reserva o lo generamos
  let qr = reserva.qr || '';
  if (!qr) {
    const token = reserva.token_qr || reserva.token || null;
    if (token) {
      try {
        qr = await generarQRTransporte(token);
      } catch (err) {
        console.warn('[PREVIEW-TRANS] No se pudo generar QR:', err?.message);
      }
    }
  }

  // Imagen principal
  const img0 = sanitizeUrl(reserva.imagen || reserva.imagen_transporte || '');
  const imgUrl = img0 ? forceJpgIfWix(img0) : '';

  const L = pickLang(reserva.idioma || 'es');

  const tripTypeRaw = reserva.tipo_viaje || '';
  const tripType = L.tripType[tripTypeRaw] || tripTypeRaw;

  const nota =
    reserva.nota ||
    reserva.comentarios ||
    (reserva.cliente && reserva.cliente.nota) ||
    '';

  const esShuttle = tripTypeRaw === 'Shuttle';

  // Nombre del transporte según idioma
  const catEN = String(
    (reserva.categoria ?? reserva.nombreen ?? reserva.nombreEN) || ''
  ).trim();
  const catES = String(
    (reserva.categoria_es ?? reserva.nombrees ?? reserva.nombreES) || ''
  ).trim();

  const categoria_i18n =
    L.code === 'es'
      ? catES || catEN || reserva.tipo_transporte || ''
      : catEN || catES || reserva.tipo_transporte || '';

  // Moneda + monto
  const moneda =
    String(
      reserva.moneda ||
        reserva.moneda_cobro_real ||
        reserva.moneda_cobro ||
        'USD'
    ).toUpperCase() === 'MXN'
      ? 'MXN'
      : 'USD';

  const totalMostrar =
    Number(
      Number.isFinite(reserva.total_cobrado)
        ? reserva.total_cobrado
        : reserva.total_pago
    ) || 0;

  const logoUrl =
    'https://static.wixstatic.com/media/f81ced_636e76aeb741411b87c4fa8aa9219410~mv2.png';

  const p = (label, value) => {
    if (value === undefined || value === null || String(value).trim() === '')
      return '';
    return `<p style="margin:2px 0;font-family:Arial,Helvetica,sans-serif;line-height:1.4;"><strong>${label}:</strong> ${value}</p>`;
  };

  const headerHTML = `
    <table style="width:100%;margin-bottom:10px;border-collapse:collapse;" role="presentation" cellspacing="0" cellpadding="0">
      <tr>
        <td style="text-align:left;vertical-align:middle;">
          <h2 style="color:green;margin:0;font-family:Arial,Helvetica,sans-serif;">${L.header_ok}</h2>
        </td>
        <td style="text-align:right;vertical-align:middle;">
          <img src="${logoUrl}" alt="Logo" style="height:45px;display:block;" />
        </td>
      </tr>
    </table>
  `.trim();

  let cuerpoHTML = '';

  if (tripTypeRaw === 'Redondo') {
    // Redondo → dos columnas Arrival / Departure
    cuerpoHTML += `
      <table style="width:100%;margin-bottom:10px;border-collapse:collapse;" role="presentation" cellspacing="0" cellpadding="0">
        <tr>
          <td style="vertical-align:top;width:48%;padding-right:10px;">
            ${p(L.labels.name, reserva.nombre_cliente)}
            ${p(L.labels.email, reserva.correo_cliente)}
            ${p(L.labels.phone, reserva.telefono_cliente)}
            ${p(
              L.labels.passengers,
              reserva.cantidad_pasajeros || reserva.pasajeros
            )}
            ${nota && nota.trim() !== '' ? p(L.labels.note, nota) : ''}
          </td>
          <td style="vertical-align:top;width:48%;">
            ${p(L.labels.folio, reserva.folio)}
            ${!esShuttle ? p(L.labels.transport, categoria_i18n) : ''}
            ${!esShuttle ? p(L.labels.capacity, reserva.capacidad) : ''}
            ${p(L.labels.tripType, tripType)}
            ${p(L.labels.total, formatCurrency(totalMostrar, moneda))}
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-top:6px;" role="presentation" cellspacing="0" cellpadding="0">
        <tr>
          <th style="text-align:left;border-bottom:1px solid #ddd;padding:0 0 5px 0;width:48%;font-family:Arial,Helvetica,sans-serif;">${L.labels.arrivalInfo}</th>
          <th style="text-align:left;border-bottom:1px solid #ddd;padding:0 0 5px 0;width:48%;font-family:Arial,Helvetica,sans-serif;">${L.labels.departureInfo}</th>
        </tr>
        <tr>
          <td style="vertical-align:top;padding-right:15px;width:48%;">
            ${p(L.labels.hotel, reserva.hotel_llegada)}
            ${p(L.labels.date, fecha_llegada)}
            ${p(L.labels.time, hora_llegada)}
            ${p(L.labels.airline, reserva.aerolinea_llegada)}
            ${p(L.labels.flight, reserva.vuelo_llegada)}
          </td>
          <td style="vertical-align:top;width:48%;">
            ${p(L.labels.hotel, reserva.hotel_salida)}
            ${p(L.labels.date, fecha_salida)}
            ${p(L.labels.time, hora_salida)}
            ${p(L.labels.airline, reserva.aerolinea_salida)}
            ${p(L.labels.flight, reserva.vuelo_salida)}
          </td>
        </tr>
      </table>
    `.trim();
  } else {
    // Llegada / Salida / Shuttle (una sola columna)
    cuerpoHTML += `
      ${p(L.labels.folio, reserva.folio)}
      ${p(L.labels.name, reserva.nombre_cliente)}
      ${p(L.labels.email, reserva.correo_cliente)}
      ${p(L.labels.phone, reserva.telefono_cliente)}
      ${!esShuttle ? p(L.labels.transport, categoria_i18n) : ''}
      ${!esShuttle ? p(L.labels.capacity, reserva.capacidad) : ''}
      ${
        reserva.cantidad_pasajeros || reserva.pasajeros
          ? p(
              L.labels.passengers,
              reserva.cantidad_pasajeros || reserva.pasajeros
            )
          : ''
      }
      ${
        reserva.hotel_llegada
          ? p(L.labels.hotel, reserva.hotel_llegada)
          : ''
      }
      ${fecha_llegada ? p(L.labels.date, fecha_llegada) : ''}
      ${hora_llegada ? p(L.labels.time, hora_llegada) : ''}
      ${
        reserva.aerolinea_llegada
          ? p(L.labels.airline, reserva.aerolinea_llegada)
          : ''
      }
      ${reserva.vuelo_llegada ? p(L.labels.flight, reserva.vuelo_llegada) : ''}
      ${
        reserva.hotel_salida
          ? p(L.labels.hotel, reserva.hotel_salida)
          : ''
      }
      ${fecha_salida ? p(L.labels.date, fecha_salida) : ''}
      ${hora_salida ? p(L.labels.time, hora_salida) : ''}
      ${
        reserva.aerolinea_salida
          ? p(L.labels.airline, reserva.aerolinea_salida)
          : ''
      }
      ${reserva.vuelo_salida ? p(L.labels.flight, reserva.vuelo_salida) : ''}
      ${p(L.labels.tripType, tripType)}
      ${p(L.labels.total, formatCurrency(totalMostrar, moneda))}
      ${nota && nota.trim() !== '' ? p(L.labels.note, nota) : ''}
    `.trim();
  }

  const imagenHTML = imgUrl
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;border-collapse:collapse;">
        <tr>
          <td>
            <img src="${imgUrl}" width="400" alt="Transport image"
                 style="display:block;width:100%;height:auto;max-width:100%;border-radius:8px;" />
          </td>
        </tr>
      </table>
    `
    : '';

  // 👉 QR VISIBLE TANTO EN PREVIEW COMO EN EL CORREO REAL
  const qrHTML = qr
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;border-collapse:collapse;">
        <tr>
          <td align="center">
            <p style="font-weight:bold;margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;">${L.labels.qrLegend}</p>
            <img src="${qr}" alt="QR Code" style="width:180px;display:block;border-radius:8px;" />
          </td>
        </tr>
      </table>
    `
    : '';

  const destinatarioHTML = `
    <p style="margin-top:14px;font-size:14px;color:#555;line-height:1.3;font-family:Arial,Helvetica,sans-serif;">
      &#128231; ${L.labels.sentTo}
      <a href="mailto:${reserva.correo_cliente}" style="color:#1b6ef3;text-decoration:none;">${reserva.correo_cliente}</a>
    </p>
  `;

  const mensajeInner = `
    ${headerHTML}
    <div style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.4;">
      ${cuerpoHTML}
      ${imagenHTML}
      ${qrHTML}
      ${L.recomendaciones}
      ${destinatarioHTML}
      ${L.politicas}
    </div>
  `.trim();

  const html = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:0;margin:0;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0"
                 style="width:600px;max-width:600px;border:2px solid #ccc;border-radius:10px;border-collapse:separate;">
            <tr>
              <td style="padding:24px 26px 32px;border-radius:10px;">
                ${mensajeInner}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `.trim();

  const subject = L.subject(reserva.folio);

  return { subject, html };
}

// correoTransporte/correosTransportePreview.js
// PREVIEW para TRANSPORTE usando el mismo layout que el correo original
// (tabla 600px, header verde, logo, QR, recomendaciones, políticas, etc.)

/* ================= i18n transporte ================= */
function pickLang(idioma) {
  const es = String(idioma || '').toLowerCase().startsWith('es');
  if (es) {
    return {
      code: 'es',
      header_ok: '✅ Reservación de Transporte Confirmada',
      labels: {
        name:'Nombre', email:'Correo', phone:'Teléfono', passengers:'Pasajeros', note:'Nota',
        folio:'Folio', transport:'Transporte', capacity:'Capacidad', total:'Total',
        tripType:'Tipo de viaje', hotel:'Hotel', date:'Fecha', time:'Hora',
        airline:'Aerolínea', flight:'Vuelo',
        arrivalInfo:'Información de Llegada', departureInfo:'Información de Salida',
        qrLegend:'Muestra este código QR a tu proveedor:',
        sentTo:'Esta confirmación fue enviada a:'
      },
      tripType: { Llegada:'Llegada', Salida:'Salida', Redondo:'Viaje Redondo', Shuttle:'Shuttle' },
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
      subject: (folio)=>`Confirmación de Transporte - Folio ${folio}`
    };
  }
  // EN (default)
  return {
    code: 'en',
    header_ok: '✅ Transport Reservation Confirmed',
    labels: {
      name:'Name', email:'Email', phone:'Phone', passengers:'Passengers', note:'Note',
      folio:'Folio', transport:'Transport', capacity:'Capacity', total:'Total',
      tripType:'Trip Type', hotel:'Hotel', date:'Date', time:'Time',
      airline:'Airline', flight:'Flight',
      arrivalInfo:'Arrival Information', departureInfo:'Departure Information',
      qrLegend:'Show this QR code to your provider:',
      sentTo:'This confirmation was sent to:'
    },
    tripType: { Llegada:'Arrival', Salida:'Departure', Redondo:'Round Trip', Shuttle:'Shuttle' },
    recomendaciones: `
      <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:8px 12px;margin-top:14px;border-radius:5px;line-height:1.3;">
        <strong style="color:#b00000;">⚠ Recommendations:</strong>
        <span style="color:#333;"> Please confirm your reservation at least 24 hours in advance to avoid any inconvenience.</span>
      </div>
    `,
    politicas: `
      <div style="margin-top:30px;padding-top:15px;border-top:1px solid #ccc;font-size:13px;color:#555;">
        <strong>&#128204; Cancellation Policy:</strong><br>
        - All cancellations or refund requests are subject to a 10% fee of the total amount paid.<br>
        <strong>- No refunds will be issued for cancellations made less than 24 hours in advance or in case of no-shows.</strong>
      </div>
    `,
    subject: (folio)=>`Transport Reservation - Folio ${folio}`
  };
}

const safeToFixed = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

function formatoHora12(hora){
  if(!hora) return '';
  const [h,m] = String(hora).split(':');
  const H = parseInt(h,10);
  const suf = H>=12?'p.m.':'a.m.';
  const h12 = (H%12)||12;
  return `${h12}:${m} ${suf}`;
}

function formatCurrency(monto, moneda) {
  const val = safeToFixed(monto);
  return `$${val} ${moneda === 'MXN' ? 'MXN' : 'USD'}`;
}

function sanitizeUrl(u = '') {
  try {
    let s = String(u || '').trim();
    if (!s) return '';
    if (s.startsWith('//')) s = 'https:' + s;
    if (s.startsWith('http://')) s = s.replace(/^http:\/\//i, 'https://');
    return s;
  } catch { return ''; }
}

// Forzar JPG en Wix para evitar WEBP en clientes
function forceJpgIfWix(url='') {
  try {
    const u = new URL(url);
    if (/wixstatic\.com$/i.test(u.hostname)) {
      if (!u.searchParams.has('format')) u.searchParams.set('format','jpg');
      if (!u.searchParams.has('width'))  u.searchParams.set('width','1200');
      return u.toString();
    }
  } catch {}
  return url;
}

/**
 * Builder de PREVIEW para TRANSPORTE.
 * Recibe la fila `reserva` de la tabla `reservaciones` y arma
 * el mismo layout que el correo original de transporte.
 */
export async function buildPreviewTransporteFromReserva(reserva) {
  if (!reserva) {
    return { subject: null, html: null };
  }

  // === Mapear reserva -> datos usados en el template de transporte ===
  const datos = {
    folio:             reserva.folio,
    idioma:            reserva.idioma,
    nombre_cliente:    reserva.nombre_cliente || '',
    correo_cliente:    reserva.correo_cliente || '',
    telefono_cliente:  reserva.telefono_cliente || '',
    cantidad_pasajeros: reserva.cantidad_pasajeros || reserva.cantidad_pasajerosok || reserva.pasajeros || 0,
    nota:              reserva.nota || reserva.comentarios || '',
    tipo_viaje:        reserva.tipo_viaje || reserva.tipoviaje || reserva.tipo || '',
    // Llegada
    hotel_llegada:     reserva.hotel_llegada || reserva.hotel || '',
    fecha_llegada:     reserva.fecha_llegada || reserva.fecha || '',
    hora_llegada:      reserva.hora_llegada || reserva.hora || '',
    aerolinea_llegada: reserva.aerolinea_llegada || reserva.aerolinea || '',
    vuelo_llegada:     reserva.vuelo_llegada || reserva.vuelo || '',
    // Salida
    hotel_salida:      reserva.hotel_salida || '',
    fecha_salida:      reserva.fecha_salida || '',
    hora_salida:       reserva.hora_salida || '',
    aerolinea_salida:  reserva.aerolinea_salida || '',
    vuelo_salida:      reserva.vuelo_salida || '',
    // Transporte
    categoria_es:      reserva.categoria_es || reserva.tipo_transporte_es || '',
    categoria:         reserva.categoria || reserva.tipo_transporte || '',
    capacidad:         reserva.capacidad || reserva.capacidad_vehiculo || '',
    // Totales / moneda
    moneda:           (reserva.moneda || reserva.moneda_cobro_real || reserva.moneda_cobro || 'USD'),
    total_pago:       reserva.total_pago || reserva.total || reserva.precio || 0,
    total_cobrado:    reserva.total_cobrado || null,
    // Imagen y QR
    imagen:           reserva.imagen || reserva.img_transporte || reserva.img_tour || '',
    qr:               reserva.qr || reserva.qr_transporte || '',
  };

  const L = pickLang(datos.idioma);
  const logoUrl = 'https://static.wixstatic.com/media/f81ced_636e76aeb741411b87c4fa8aa9219410~mv2.png';

  const img0   = sanitizeUrl(datos.imagen);
  const imgUrl = img0 ? forceJpgIfWix(img0) : '';

  const tripType = (L.tripType[datos.tipo_viaje] || datos.tipo_viaje || '');
  const esShuttle = datos.tipo_viaje === 'Shuttle';

  const moneda = (String(datos.moneda || 'USD').toUpperCase() === 'MXN') ? 'MXN' : 'USD';
  const totalMostrar = Number(
    Number.isFinite(datos.total_cobrado) ? datos.total_cobrado : datos.total_pago
  ) || 0;

  const catEN = String((datos.categoria || '')).trim();
  const catES = String((datos.categoria_es || '')).trim();
  const categoria_i18n = (L.code === 'es')
    ? (catES || catEN || reserva.tipo_transporte || '')
    : (catEN || catES || reserva.tipo_transporte || '');

  const p = (label, value) => {
    if (value === undefined || value === null || String(value).trim() === '') return '';
    return `<p style="margin:2px 0;font-family:Arial,Helvetica,sans-serif;line-height:1.4;"><strong>${label}:</strong> ${value}</p>`;
  };

  // Header (igual que el original, pero aquí usamos src directo del logo)
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

  // Cuerpo principal (Redondo vs simple)
  let cuerpoHTML = '';
  if (datos.tipo_viaje === 'Redondo') {
    // 2 columnas: Llegada / Salida
    cuerpoHTML += `
      <table style="width:100%;margin-bottom:10px;border-collapse:collapse;" role="presentation" cellspacing="0" cellpadding="0">
        <tr>
          <td style="vertical-align:top;width:48%;padding-right:10px;">
            ${p(L.labels.name,  datos.nombre_cliente)}
            ${p(L.labels.email, datos.correo_cliente)}
            ${p(L.labels.phone, datos.telefono_cliente)}
            ${p(L.labels.passengers, datos.cantidad_pasajeros)}
            ${datos.nota && String(datos.nota).trim() !== '' ? p(L.labels.note, datos.nota) : ''}
          </td>
          <td style="vertical-align:top;width:48%;">
            ${p(L.labels.folio, datos.folio)}
            ${!esShuttle ? p(L.labels.transport, categoria_i18n) : ''}
            ${!esShuttle ? p(L.labels.capacity,  datos.capacidad) : ''}
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
            ${p(L.labels.hotel,   datos.hotel_llegada)}
            ${p(L.labels.date,    datos.fecha_llegada)}
            ${p(L.labels.time,    formatoHora12(datos.hora_llegada))}
            ${p(L.labels.airline, datos.aerolinea_llegada)}
            ${p(L.labels.flight,  datos.vuelo_llegada)}
          </td>
          <td style="vertical-align:top;width:48%;">
            ${p(L.labels.hotel,   datos.hotel_salida)}
            ${p(L.labels.date,    datos.fecha_salida)}
            ${p(L.labels.time,    formatoHora12(datos.hora_salida))}
            ${p(L.labels.airline, datos.aerolinea_salida)}
            ${p(L.labels.flight,  datos.vuelo_salida)}
          </td>
        </tr>
      </table>
    `.trim();
  } else {
    // 1 columna (Llegada / Salida / Shuttle)
    cuerpoHTML += `
      ${p(L.labels.folio, datos.folio)}
      ${p(L.labels.name,  datos.nombre_cliente)}
      ${p(L.labels.email, datos.correo_cliente)}
      ${p(L.labels.phone, datos.telefono_cliente)}
      ${!esShuttle ? p(L.labels.transport, categoria_i18n) : ''}
      ${!esShuttle ? p(L.labels.capacity,  datos.capacidad) : ''}
      ${datos.cantidad_pasajeros ? p(L.labels.passengers, datos.cantidad_pasajeros) : ''}
      ${datos.hotel_llegada   ? p(L.labels.hotel,   datos.hotel_llegada)   : ''}
      ${datos.fecha_llegada   ? p(L.labels.date,    datos.fecha_llegada)   : ''}
      ${datos.hora_llegada    ? p(L.labels.time,    formatoHora12(datos.hora_llegada)) : ''}
      ${datos.aerolinea_llegada ? p(L.labels.airline, datos.aerolinea_llegada) : ''}
      ${datos.vuelo_llegada   ? p(L.labels.flight,  datos.vuelo_llegada)   : ''}
      ${datos.hotel_salida    ? p(L.labels.hotel,   datos.hotel_salida)    : ''}
      ${datos.fecha_salida    ? p(L.labels.date,    datos.fecha_salida)    : ''}
      ${datos.hora_salida     ? p(L.labels.time,    formatoHora12(datos.hora_salida)) : ''}
      ${datos.aerolinea_salida ? p(L.labels.airline, datos.aerolinea_salida) : ''}
      ${datos.vuelo_salida    ? p(L.labels.flight,  datos.vuelo_salida)    : ''}
      ${p(L.labels.tripType, tripType)}
      ${p(L.labels.total, formatCurrency(totalMostrar, moneda))}
      ${datos.nota && String(datos.nota).trim() !== '' ? p(L.labels.note, datos.nota) : ''}
    `.trim();
  }

  // Imagen principal
  const imagenHTML = imgUrl ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;border-collapse:collapse;">
      <tr>
        <td>
          <img src="${imgUrl}" width="400" alt="Transport image"
               style="display:block;width:100%;height:auto;max-width:100%;border-radius:8px;" />
        </td>
      </tr>
    </table>
  ` : '';

  // QR (en preview usamos src directo, NO cid)
  const qrHTML = datos.qr ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;border-collapse:collapse;">
      <tr>
        <td align="center">
          <p style="font-weight:bold;margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;">${L.labels.qrLegend}</p>
          <img src="${datos.qr}" alt="QR Code" style="width:180px;display:block;border-radius:8px;" />
        </td>
      </tr>
    </table>
  ` : '';

  const destinatarioHTML = `
    <p style="margin-top:14px;font-size:14px;color:#555;line-height:1.3;font-family:Arial,Helvetica,sans-serif;">
      &#128231; ${L.labels.sentTo}
      <a href="mailto:${datos.correo_cliente}" style="color:#1b6ef3;text-decoration:none;">${datos.correo_cliente}</a>
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

  const mensajeHTML = `
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

  const subject = (L.subject)(datos.folio || '');

  const htmlDoc = `
<!DOCTYPE html>
<html lang="${L.code}">
<head>
  <meta charset="UTF-8" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;">
  ${mensajeHTML}
</body>
</html>
  `.trim();

  return { subject, html: htmlDoc };
}

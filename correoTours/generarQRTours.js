// correoTours/generarQRTours.js
import QRCode from 'qrcode';

// PUBLIC_APP_BASE_URL=https://nkmsistemas.wixsite.com/cabo-travel-activiti
const BASE_URL =
  process.env.PUBLIC_APP_BASE_URL ||
  'https://nkmsistemas.wixsite.com/cabo-travel-activiti';

export async function generarQRDestino(
  token,
  { size = 320, margin = 1 } = {}
) {
  if (!token) throw new Error('generarQRDestino: token requerido');
  const url = `${BASE_URL}/login?token=${encodeURIComponent(token)}&type=tours`;
  try {
    return await QRCode.toDataURL(url, { width: size, margin });
  } catch (error) {
    console.error('❌ Error al generar QR (destino):', error);
    throw error;
  }
}

export async function generarQRDataUrl(payload, { size = 320, margin = 1 } = {}) {
  try {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return await QRCode.toDataURL(data, { width: size, margin });
  } catch (error) {
    console.error('❌ Error al generar QR (genérico):', error);
    throw error;
  }
}

export default generarQRDestino;

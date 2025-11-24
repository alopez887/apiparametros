// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// Handlers tipo de cambio
import { obtenerTipoCambio } from './obtenerTipoCambio.js';
import { guardarTipoCambio } from './guardarTipoCambio.js';

// 🔹 Handlers para correos de reservación (errores)
import {
  contarCorreosReservacionError,
  listarCorreosReservacionError,
  actualizarCorreoCliente,
} from './correosReservacion.js';

// 🔹 NUEVO: handler para PREVIEW de correo de reservación
import { previewCorreoReservacion } from './correosReservacionPreview.js';

// 🔹 NUEVO: handler para ENVIAR correo y marcar email_reservacion='enviado'
import { reenviarCorreoReservacion } from './correosReservacionEnviar.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors());
app.options('*', cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'api-parametros', msg: 'API Parámetros OK' });
});

// ===== Tipo de cambio =====
app.get('/api/tipo-cambio', obtenerTipoCambio);
app.post('/api/tipo-cambio', guardarTipoCambio);

// ===== Correos reservación – contador para badge =====
app.get('/api/correos-reservacion-error', contarCorreosReservacionError);

// ===== Correos reservación – lista detallada para iframeMailnosend =====
app.get('/api/correos-reservacion-error/lista', listarCorreosReservacionError);

// ===== Correos reservación – actualizar correo_cliente =====
app.post('/api/correos-reservacion-error/actualizar-correo', actualizarCorreoCliente);

// 🔹 PREVIEW de correo de reservación (NO envía, solo datos crudos)
// Soporta GET ?folio=XXXX y POST { folio }
app.get('/api/correos-reservacion-error/preview', previewCorreoReservacion);
app.post('/api/correos-reservacion-error/preview', previewCorreoReservacion);

// 🔹 NUEVO: ENVIAR correo al cliente y marcar email_reservacion = 'enviado'
// Body esperado: { folio }
app.post('/api/correos-reservacion-error/enviar', reenviarCorreoReservacion);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, _req, res, _next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 API-Parametros escuchando en puerto ${PORT}`);
});

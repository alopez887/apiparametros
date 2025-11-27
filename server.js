// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// Handlers tipo de cambio
import { obtenerTipoCambio } from './obtenerTipoCambio.js';
import { guardarTipoCambio } from './guardarTipoCambio.js';

// 🔹 Handlers para correos de reservación (errores: contador/lista/editar correo)
import {
  contarCorreosReservacionError,
  listarCorreosReservacionError,
  actualizarCorreoCliente,
} from './correosReservacion.js';

// 🔹 Handler para PREVIEW (usa internamente actividades / transporte / tours)
import { previewCorreoReservacion } from './correosReservacionPreview.js';

// 🔹 Handler SOLO para reenviar correos de ACTIVIDADES
// (antes se llamaba correosReservacionEnviar.js en la raíz)
import {
  reenviarCorreoReservacion as reenviarCorreoActividades,
} from './correoActividades/correoActividadesEnviar.js';

// 🔹 Handler SOLO para reenviar correos de TRANSPORTE
import {
  reenviarCorreoTransporte,
} from './correoTransporte/correosTransporteEnviar.js';

// 🔹 NUEVO: handler SOLO para reenviar correos de TOURS
import {
  reenviarCorreoTours,
} from './correoTours/correosToursEnviar.js';

import {
  listarUsuariosTransporte,
  crearUsuarioTransporte,
} from './registros/usuariosTransporte.js';

const app  = express();
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
app.get('/api/correos-reservacion-error/preview', previewCorreoReservacion);
app.post('/api/correos-reservacion-error/preview', previewCorreoReservacion);

// 🔹 ENVIAR correo al cliente – ACTIVIDADES
// Body esperado: { folio }
// El iframe sigue pegándole a esta misma ruta.
app.post('/api/correos-reservacion-error/enviar', reenviarCorreoActividades);

// 🔹 ENVIAR correo al cliente – TRANSPORTE
app.post('/api/correos-reservacion-error/enviar-transporte', reenviarCorreoTransporte);

// 🔹 ENVIAR correo al cliente – TOURS
app.post('/api/correos-reservacion-error/enviar-tours', reenviarCorreoTours);

app.get('/api/registros/usuarios-transporte', listarUsuariosTransporte);

app.post('/api/registros/usuarios-transporte', crearUsuarioTransporte);

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

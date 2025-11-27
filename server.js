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

// 🔹 USUARIOS TRANSPORTE
import { listarUsuariosTransporte } from './registros/usuariosTransporte.js';
import { crearUsuarioTransporte }   from './registros/crearUsuarioTransporte.js';

const app  = express();
const PORT = process.env.PORT || 3000;

// 🔹 LOG de arranque
console.log('🔧 Iniciando API-Parametros con config:', {
  NODE_ENV: process.env.NODE_ENV || 'dev',
  PORT,
  PGHOST: process.env.PGHOST,
  PGDATABASE: process.env.PGDATABASE,
});

// Config
app.set('trust proxy', 1);
app.use(cors());
app.options('*', cors());
app.use(express.json());

// 🔹 LOG de cada request
app.use((req, _res, next) => {
  const { method, originalUrl, query, body } = req;
  console.log(`➡️  ${method} ${originalUrl}`, {
    query,
    // para no llenar logs con cosas enormes, truncamos body grande
    body:
      body && Object.keys(body).length
        ? JSON.stringify(body).slice(0, 500)
        : body,
  });
  next();
});

app.get('/', (_req, res) => {
  console.log('⚙️  GET /');
  res.json({ ok: true, service: 'api-parametros', msg: 'API Parámetros OK' });
});

// ===== Tipo de cambio =====
app.get('/api/tipo-cambio', (req, res) => {
  console.log('📈 GET /api/tipo-cambio');
  return obtenerTipoCambio(req, res);
});

app.post('/api/tipo-cambio', (req, res) => {
  console.log('💾 POST /api/tipo-cambio body:', req.body);
  return guardarTipoCambio(req, res);
});

// ===== Correos reservación – contador para badge =====
app.get('/api/correos-reservacion-error', (req, res) => {
  console.log('🔢 GET /api/correos-reservacion-error');
  return contarCorreosReservacionError(req, res);
});

// ===== Correos reservación – lista detallada para iframeMailnosend =====
app.get('/api/correos-reservacion-error/lista', (req, res) => {
  console.log('📋 GET /api/correos-reservacion-error/lista', { query: req.query });
  return listarCorreosReservacionError(req, res);
});

// ===== Correos reservación – actualizar correo_cliente =====
app.post('/api/correos-reservacion-error/actualizar-correo', (req, res) => {
  console.log('✏️  POST /api/correos-reservacion-error/actualizar-correo', {
    body: req.body,
  });
  return actualizarCorreoCliente(req, res);
});

// 🔹 PREVIEW de correo de reservación (GET/POST)
app.get('/api/correos-reservacion-error/preview', (req, res) => {
  console.log('👁️  GET /api/correos-reservacion-error/preview', {
    query: req.query,
  });
  return previewCorreoReservacion(req, res);
});

app.post('/api/correos-reservacion-error/preview', (req, res) => {
  console.log('👁️  POST /api/correos-reservacion-error/preview', {
    body: req.body,
  });
  return previewCorreoReservacion(req, res);
});

// 🔹 ENVIAR correo al cliente – ACTIVIDADES
app.post('/api/correos-reservacion-error/enviar', (req, res) => {
  console.log('📨 POST /api/correos-reservacion-error/enviar (ACTIVIDADES)', {
    body: req.body,
  });
  return reenviarCorreoActividades(req, res);
});

// 🔹 ENVIAR correo al cliente – TRANSPORTE
app.post('/api/correos-reservacion-error/enviar-transporte', (req, res) => {
  console.log(
    '📨 POST /api/correos-reservacion-error/enviar-transporte (TRANSPORTE)',
    { body: req.body }
  );
  return reenviarCorreoTransporte(req, res);
});

// 🔹 ENVIAR correo al cliente – TOURS
app.post('/api/correos-reservacion-error/enviar-tours', (req, res) => {
  console.log('📨 POST /api/correos-reservacion-error/enviar-tours (TOURS)', {
    body: req.body,
  });
  return reenviarCorreoTours(req, res);
});

// 🔹 USUARIOS TRANSPORTE
app.get('/api/registros/usuarios-transporte', (req, res) => {
  console.log('👥 GET /api/registros/usuarios-transporte', {
    query: req.query,
  });
  return listarUsuariosTransporte(req, res);
});

app.post('/api/registros/usuarios-transporte', (req, res) => {
  console.log('➕ POST /api/registros/usuarios-transporte (crear usuario)', {
    body: req.body,
  });
  return crearUsuarioTransporte(req, res);
});

// 404
app.use((req, res) => {
  console.warn('⚠️  404 Not Found:', req.method, req.originalUrl);
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error handler global
app.use((err, _req, res, _next) => {
  console.error('💥 Unhandled error:', {
    message: err?.message,
    stack: err?.stack,
    code: err?.code,
    detail: err?.detail,
  });
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 API-Parametros escuchando en puerto ${PORT}`);
});

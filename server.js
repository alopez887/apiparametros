// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// Handlers
import { obtenerTipoCambio } from './obtenerTipoCambio.js';
import { guardarTipoCambio } from './guardarTipoCambio.js';

// 🔹 NUEVO: handlers para correos de reservación
import {
  contarCorreosReservacionError,
  listarCorreosReservacionError
} from './correosReservacion.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors());
app.options('*', cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'api-parametros', msg: 'API Parámetros OK' });
});

// Tipo de cambio
app.get('/api/tipo-cambio', obtenerTipoCambio);
app.post('/api/tipo-cambio', guardarTipoCambio);

// 🔹 Correos reservación – contador para badge
app.get('/api/correos-reservacion-error', contarCorreosReservacionError);

// 🔹 Correos reservación – lista detallada para iframeMailnosend
app.get('/api/correos-reservacion-error/lista', listarCorreosReservacionError);

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

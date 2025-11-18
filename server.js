// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// Handlers
import { obtenerTipoCambio } from './obtenerTipoCambio.js';
import { guardarTipoCambio } from './guardarTipoCambio.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Detrás de proxy (Railway)
app.set('trust proxy', 1);

// CORS + body JSON
app.use(cors());
app.options('*', cors());
app.use(express.json());

// ====== RUTA BASE (salud) ======
app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'api-parametros', msg: 'API Parámetros OK' });
});

// ====== ENDPOINTS TIPO DE CAMBIO ======
app.get('/api/tipo-cambio', obtenerTipoCambio);
app.post('/api/tipo-cambio', guardarTipoCambio);

// ====== 404 ======
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ====== MANEJADOR DE ERRORES ======
app.use((err, _req, res, _next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ====== ARRANQUE ======
app.listen(PORT, () => {
  console.log(`🚀 API-Parametros escuchando en puerto ${PORT}`);
});

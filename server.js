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
import { listarUsuariosTransporte } from './transporte/usuariosTransporte.js';
import {
  crearUsuarioTransporte,
  actualizarUsuarioTransporte,
  cambiarEstatusUsuarioTransporte
} from './transporte/crearUsuarioTransporte.js';

// 🔹 PARTNERS (actividades_proveedores)
import { listarPartners } from './partners/listarPartners.js';
import {
  crearPartner,
  actualizarPartner,
  cambiarEstatusPartner
} from './partners/crearPartner.js';

// 🔹 USUARIOS PARTNERS
import { listarUsuariosPartners } from './partners/usuariosPartners.js';
import { actualizarUsuarioPartner } from './partners/actualizarUsuarioPartner.js';
import { crearUsuarioPartner }     from './partners/crearUsuarioPartner.js';
import { estatusUsuarioPartners } from './partners/estatusUsuarioPartners.js';

// 🔹 ACTIVIDADES (tabla tours) Estandar
import { listarActividades } from './actividades/actividadestandar/listarActividades.js';
import { listarPartnersAct } from './actividades/listarPartners.js';						//Se utiliza para todas las tablas
import { actualizarActividad } from './actividades/actividadestandar/actualizarActividad.js';
import { agregarActividadEstandar } from './actividades/actividadestandar/agregarActividadestandar.js';
import { cambiarEstatusActividadEstandar } from './actividades/actividadestandar/activarActEstandar.js';

// 🔹 ACTIVIDADES (tabla tourduracion) Duracion
import { listarActividadesDuracion } from './actividades/actividadduracion/listarActividadesDuracion.js';
import { crearActividadDuracion }   from './actividades/actividadduracion/crearActividadDuracion.js';
import { actualizarActividadDuracion } from './actividades/actividadduracion/actualizarActividadDuracion.js';
import { cambiarEstatusActividadDuracion } from './actividades/actividadduracion/estatusActividadDuracion.js';

// 🔹 ACTIVIDADES (tabla tours) PAX
import { listarActividadesPax } from './actividades/actividadpax/listarActividadesPax.js';
import { actualizarActividadPax } from './actividades/actividadpax/actualizarActividadPax.js';
import { agregarActividadPax } from './actividades/actividadpax/agregarActividadPax.js';
import EstatusActividadPax  from './actividades/actividadpax/EstatusActividadPax.js';

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
app.post('/api/correos-reservacion-error/enviar', reenviarCorreoActividades);

// 🔹 ENVIAR correo al cliente – TRANSPORTE
app.post('/api/correos-reservacion-error/enviar-transporte', reenviarCorreoTransporte);

// 🔹 ENVIAR correo al cliente – TOURS
app.post('/api/correos-reservacion-error/enviar-tours', reenviarCorreoTours);

// 🔹 USUARIOS TRANSPORTE
app.get('/api/transporte/usuarios-transporte', listarUsuariosTransporte);
app.post('/api/transporte/usuarios-transporte', crearUsuarioTransporte);
app.put('/api/transporte/usuarios-transporte/:id', actualizarUsuarioTransporte);
app.patch('/api/transporte/usuarios-transporte/:id/activo', cambiarEstatusUsuarioTransporte);

// 🔹 PARTNERS (tabla actividades_proveedores)
app.get('/api/partners', listarPartners);
app.post('/api/partners', crearPartner);
app.put('/api/partners/:id', actualizarPartner);
app.patch('/api/partners/:id/activo', cambiarEstatusPartner);

// 🔹 USUARIOS PARTNERS (tabla actividades_usuarios)
app.get('/api/partners/usuarios-partners', listarUsuariosPartners);
app.put('/api/partners/usuarios-partners/:id', actualizarUsuarioPartner);
app.post('/api/partners/usuarios-partners', crearUsuarioPartner);
app.patch('/api/partners/usuarios-partners/:id/estatus', estatusUsuarioPartners);

// 🔹 ACTIVIDADES (tabla tours) ESTANDAR
app.get('/api/actividades/listar-actividades', listarActividades);
app.get('/api/actividades/listar-partners', listarPartnersAct);    //Se usa para todos los catalogos....
app.put('/api/actividades/:id', actualizarActividad);
app.post('/api/actividades', agregarActividadEstandar);
app.patch('/api/actividades/:id/estatus', cambiarEstatusActividadEstandar);

// 🔹 ACTIVIDADES (tabla tourDURACION) DURACION
app.get('/api/actividades-duracion/listar-actividades', listarActividadesDuracion);
app.post('/api/actividades-duracion', crearActividadDuracion);
app.put('/api/actividades-duracion/:id', actualizarActividadDuracion);
app.patch('/api/actividades-duracion/:id/estatus', cambiarEstatusActividadDuracion);

// 🔹 ACTIVIDADES (tabla tour_pax) PAX
app.get('/api/actividades-pax/listar-actividades', listarActividadesPax);
app.put('/api/actividades-pax/:id', actualizarActividadPax);
app.post('/api/actividades-pax', agregarActividadPax);
app.patch('/api/actividades-pax/:id/estatus', EstatusActividadPax);

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

// /estructuraCorreos/estructuraCorreoAct.js

// ⬅️ Usa el MISMO pool que todos tus handlers (tipo-cambio, etc.)
import pool from '../conexion.js';

/**
 * Tabla esperada:
 * ajustes_correo(
 *   id BIGSERIAL PK,
 *   plantilla_servicio TEXT NOT NULL,   -- activities | transport | tours
 *   plantilla_momento  TEXT NOT NULL,   -- purchase | schedule | single
 *
 *   bcc                TEXT NOT NULL DEFAULT '',
 *   nombre_remitente   TEXT NOT NULL DEFAULT '',
 *   logo_url           TEXT NOT NULL DEFAULT '',
 *
 *   asunto_es          TEXT NOT NULL DEFAULT '',
 *   asunto_en          TEXT NOT NULL DEFAULT '',
 *
 *   titulo_es          TEXT NOT NULL DEFAULT '',
 *   titulo_en          TEXT NOT NULL DEFAULT '',
 *
 *   proveedor_es       TEXT NOT NULL DEFAULT '',
 *   proveedor_en       TEXT NOT NULL DEFAULT '',
 *
 *   recomendaciones_es TEXT NOT NULL DEFAULT '',
 *   recomendaciones_en TEXT NOT NULL DEFAULT '',
 *
 *   enviado_a_es       TEXT NOT NULL DEFAULT '',
 *   enviado_a_en       TEXT NOT NULL DEFAULT '',
 *
 *   created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
 *   updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
 *
 *   UNIQUE(plantilla_servicio, plantilla_momento)
 * );
 */

const ALLOWED_SERVICES = new Set(['activities', 'transport', 'tours']);
const ALLOWED_MOMENTS  = new Set(['purchase', 'schedule', 'single']);

function normService(v) {
  const s = String(v || '').trim().toLowerCase();
  return ALLOWED_SERVICES.has(s) ? s : '';
}

function normMoment(v) {
  const m = String(v || '').trim().toLowerCase();
  return ALLOWED_MOMENTS.has(m) ? m : '';
}

function asText(v) {
  return String(v ?? '').trim();
}

/**
 * GET /api/ajustes-correo?servicio=activities&momento=purchase
 */
export async function obtenerAjustesCorreo(req, res, next) {
  try {
    const servicio = normService(req.query.servicio);
    const momento  = normMoment(req.query.momento);

    if (!servicio) {
      return res.status(400).json({ ok:false, error:'servicio inválido' });
    }
    if (!momento) {
      return res.status(400).json({ ok:false, error:'momento inválido' });
    }

    const sql = `
      SELECT
        id,
        plantilla_servicio,
        plantilla_momento,
        bcc,
        nombre_remitente,
        logo_url,
        asunto_es,
        asunto_en,
        titulo_es,
        titulo_en,
        proveedor_es,
        proveedor_en,
        recomendaciones_es,
        recomendaciones_en,
        enviado_a_es,
        enviado_a_en,
        created_at,
        updated_at
      FROM ajustes_correo
      WHERE plantilla_servicio = $1
        AND plantilla_momento  = $2
      LIMIT 1
    `;

    const { rows } = await pool.query(sql, [servicio, momento]);

    if (!rows.length) {
      // No hay registro → regresamos payload vacío para que el iframe no truene
      return res.json({
        ok: true,
        found: false,
        payload: {
          plantilla_servicio: servicio,
          plantilla_momento:  momento,
          bcc: '',
          nombre_remitente: '',
          logo_url: '',
          asunto_es: '',
          asunto_en: '',
          titulo_es: '',
          titulo_en: '',
          proveedor_es: '',
          proveedor_en: '',
          recomendaciones_es: '',
          recomendaciones_en: '',
          enviado_a_es: '',
          enviado_a_en: ''
        }
      });
    }

    return res.json({
      ok: true,
      found: true,
      payload: rows[0]
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/ajustes-correo
 * Body JSON esperado:
 * {
 *   servicio: "activities" | "transport" | "tours",
 *   momento:  "purchase" | "schedule" | "single",
 *
 *   bcc,
 *   nombre_remitente,
 *   logo_url,
 *
 *   asunto_es, asunto_en,
 *   titulo_es, titulo_en,
 *
 *   proveedor_es, proveedor_en,
 *   recomendaciones_es, recomendaciones_en,
 *   enviado_a_es, enviado_a_en
 * }
 */
export async function guardarAjustesCorreo(req, res, next) {
  try {
    const servicio = normService(req.body.servicio || req.body.plantilla_servicio);
    const momento  = normMoment(req.body.momento  || req.body.plantilla_momento);

    if (!servicio) {
      return res.status(400).json({ ok:false, error:'servicio inválido' });
    }
    if (!momento) {
      return res.status(400).json({ ok:false, error:'momento inválido' });
    }

    const bcc               = asText(req.body.bcc);
    const nombre_remitente  = asText(req.body.nombre_remitente);
    const logo_url          = asText(req.body.logo_url);

    const asunto_es         = asText(req.body.asunto_es);
    const asunto_en         = asText(req.body.asunto_en);

    const titulo_es         = asText(req.body.titulo_es);
    const titulo_en         = asText(req.body.titulo_en);

    const proveedor_es      = asText(req.body.proveedor_es);
    const proveedor_en      = asText(req.body.proveedor_en);

    const recomendaciones_es = asText(req.body.recomendaciones_es);
    const recomendaciones_en = asText(req.body.recomendaciones_en);

    const enviado_a_es      = asText(req.body.enviado_a_es);
    const enviado_a_en      = asText(req.body.enviado_a_en);

    const sql = `
      INSERT INTO ajustes_correo (
        plantilla_servicio,
        plantilla_momento,
        bcc,
        nombre_remitente,
        logo_url,
        asunto_es,
        asunto_en,
        titulo_es,
        titulo_en,
        proveedor_es,
        proveedor_en,
        recomendaciones_es,
        recomendaciones_en,
        enviado_a_es,
        enviado_a_en
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
      )
      ON CONFLICT (plantilla_servicio, plantilla_momento)
      DO UPDATE SET
        bcc                = EXCLUDED.bcc,
        nombre_remitente   = EXCLUDED.nombre_remitente,
        logo_url           = EXCLUDED.logo_url,
        asunto_es          = EXCLUDED.asunto_es,
        asunto_en          = EXCLUDED.asunto_en,
        titulo_es          = EXCLUDED.titulo_es,
        titulo_en          = EXCLUDED.titulo_en,
        proveedor_es       = EXCLUDED.proveedor_es,
        proveedor_en       = EXCLUDED.proveedor_en,
        recomendaciones_es = EXCLUDED.recomendaciones_es,
        recomendaciones_en = EXCLUDED.recomendaciones_en,
        enviado_a_es       = EXCLUDED.enviado_a_es,
        enviado_a_en       = EXCLUDED.enviado_a_en,
        updated_at         = now()
      RETURNING
        id,
        plantilla_servicio,
        plantilla_momento,
        bcc,
        nombre_remitente,
        logo_url,
        asunto_es,
        asunto_en,
        titulo_es,
        titulo_en,
        proveedor_es,
        proveedor_en,
        recomendaciones_es,
        recomendaciones_en,
        enviado_a_es,
        enviado_a_en,
        created_at,
        updated_at
    `;

    const { rows } = await pool.query(sql, [
      servicio,
      momento,
      bcc,
      nombre_remitente,
      logo_url,
      asunto_es,
      asunto_en,
      titulo_es,
      titulo_en,
      proveedor_es,
      proveedor_en,
      recomendaciones_es,
      recomendaciones_en,
      enviado_a_es,
      enviado_a_en
    ]);

    return res.json({ ok:true, payload: rows[0] });
  } catch (err) {
    return next(err);
  }
}

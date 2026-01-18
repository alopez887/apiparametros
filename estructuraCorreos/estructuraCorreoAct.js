// /estructuraCorreos/estructuraCorreoAct.js

// ⬅️ Usa el MISMO pool que todos tus handlers (tipo-cambio, etc.)
import pool from '../conexion.js';


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
        texto_proveedor_es AS proveedor_es,
        texto_proveedor_en AS proveedor_en,
        recomendaciones_es,
        recomendaciones_en,
        politica_es,
        politica_en,
        redes_sociales_es,
        redes_sociales_en,
        texto_enviado_a_es AS enviado_a_es,
        texto_enviado_a_en AS enviado_a_en,
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
          politica_es: '',
          politica_en: '',
          redes_sociales_es: '',
          redes_sociales_en: '',
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
 *
 *   politica_es, politica_en,
 *   redes_sociales_es, redes_sociales_en,
 *
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

    const bcc                = asText(req.body.bcc);
    const nombre_remitente   = asText(req.body.nombre_remitente);
    const logo_url           = asText(req.body.logo_url);

    const asunto_es          = asText(req.body.asunto_es);
    const asunto_en          = asText(req.body.asunto_en);

    const titulo_es          = asText(req.body.titulo_es);
    const titulo_en          = asText(req.body.titulo_en);

    // 🔹 Estos vienen del iframe como proveedor_* pero se guardan como texto_proveedor_*
    const proveedor_es       = asText(req.body.proveedor_es);
    const proveedor_en       = asText(req.body.proveedor_en);

    const recomendaciones_es = asText(req.body.recomendaciones_es);
    const recomendaciones_en = asText(req.body.recomendaciones_en);

    // 🔹 Política (nuevos campos)
    const politica_es        = asText(req.body.politica_es);
    const politica_en        = asText(req.body.politica_en);

    // 🔹 Redes sociales (nuevos campos)
    const redes_sociales_es  = asText(req.body.redes_sociales_es);
    const redes_sociales_en  = asText(req.body.redes_sociales_en);

    // 🔹 Estos vienen del iframe como enviado_a_* pero se guardan como texto_enviado_a_*
    const enviado_a_es       = asText(req.body.enviado_a_es);
    const enviado_a_en       = asText(req.body.enviado_a_en);

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
        texto_proveedor_es,
        texto_proveedor_en,
        recomendaciones_es,
        recomendaciones_en,
        politica_es,
        politica_en,
        redes_sociales_es,
        redes_sociales_en,
        texto_enviado_a_es,
        texto_enviado_a_en
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      )
      ON CONFLICT (plantilla_servicio, plantilla_momento)
      DO UPDATE SET
        bcc                 = EXCLUDED.bcc,
        nombre_remitente    = EXCLUDED.nombre_remitente,
        logo_url            = EXCLUDED.logo_url,
        asunto_es           = EXCLUDED.asunto_es,
        asunto_en           = EXCLUDED.asunto_en,
        titulo_es           = EXCLUDED.titulo_es,
        titulo_en           = EXCLUDED.titulo_en,
        texto_proveedor_es  = EXCLUDED.texto_proveedor_es,
        texto_proveedor_en  = EXCLUDED.texto_proveedor_en,
        recomendaciones_es  = EXCLUDED.recomendaciones_es,
        recomendaciones_en  = EXCLUDED.recomendaciones_en,
        politica_es         = EXCLUDED.politica_es,
        politica_en         = EXCLUDED.politica_en,
        redes_sociales_es   = EXCLUDED.redes_sociales_es,
        redes_sociales_en   = EXCLUDED.redes_sociales_en,
        texto_enviado_a_es  = EXCLUDED.texto_enviado_a_es,
        texto_enviado_a_en  = EXCLUDED.texto_enviado_a_en,
        updated_at          = now()
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
        texto_proveedor_es AS proveedor_es,
        texto_proveedor_en AS proveedor_en,
        recomendaciones_es,
        recomendaciones_en,
        politica_es,
        politica_en,
        redes_sociales_es,
        redes_sociales_en,
        texto_enviado_a_es AS enviado_a_es,
        texto_enviado_a_en AS enviado_a_en,
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
      politica_es,
      politica_en,
      redes_sociales_es,
      redes_sociales_en,
      enviado_a_es,
      enviado_a_en
    ]);

    return res.json({ ok:true, payload: rows[0] });
  } catch (err) {
    return next(err);
  }
}

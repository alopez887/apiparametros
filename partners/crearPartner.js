// partners/crearPartner.js
import pool from '../conexion.js';

/**
 * Normaliza el payload de emails_cc:
 * - si viene como string "a@x.com,b@y.com" => ['a@x.com','b@y.com']
 * - si viene arreglo => lo limpia
 * - si viene vacío => []
 */
function normalizarEmailsCC(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map(v => String(v || '').trim())
      .filter(Boolean);
  }
  const s = String(value || '').trim();
  if (!s) return [];
  return s
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

/**
 * POST /api/registros/partners
 * Body: { nombre, email_contacto, telefono_contacto?, emails_cc? }
 */
export async function crearPartner(req, res) {
  try {
    const {
      nombre,
      email_contacto,
      telefono_contacto,
      emails_cc
    } = req.body || {};

    if (!nombre || !email_contacto) {
      return res.status(400).json({
        ok: false,
        error: 'nombre y email_contacto son obligatorios'
      });
    }

    const emailsArr = normalizarEmailsCC(emails_cc);

    const sql = `
      INSERT INTO actividades_proveedores
        (nombre, email_contacto, telefono_contacto, emails_cc, activo, created_at, updated_at)
      VALUES
        ($1, $2, $3, $4, TRUE, NOW(), NOW())
      RETURNING
        id,
        nombre,
        email_contacto,
        telefono_contacto,
        emails_cc,
        activo,
        created_at,
        updated_at
    `;
    const params = [
      String(nombre).trim(),
      String(email_contacto).trim(),
      telefono_contacto ? String(telefono_contacto).trim() : null,
      emailsArr
    ];

    const { rows } = await pool.query(sql, params);
    const partner = rows[0];

    return res.status(201).json({
      ok: true,
      partner
    });
  } catch (err) {
    console.error('❌ crearPartner error:', err);

    // Unique, por si después agregas constraint UNIQUE(nombre) o similar
    if (err.code === '23505') {
      return res.status(409).json({
        ok: false,
        error: 'Ya existe un partner con esos datos'
      });
    }

    return res.status(500).json({
      ok: false,
      error: 'Error al crear partner'
    });
  }
}

/**
 * PUT /api/registros/partners/:id
 * Body: { nombre, email_contacto, telefono_contacto?, emails_cc? }
 */
export async function actualizarPartner(req, res) {
  const { id } = req.params || {};
  const partnerId = Number(id);

  if (!Number.isFinite(partnerId) || partnerId <= 0) {
    return res.status(400).json({
      ok: false,
      error: 'ID inválido'
    });
  }

  try {
    const {
      nombre,
      email_contacto,
      telefono_contacto,
      emails_cc
    } = req.body || {};

    if (!nombre || !email_contacto) {
      return res.status(400).json({
        ok: false,
        error: 'nombre y email_contacto son obligatorios'
      });
    }

    const emailsArr = normalizarEmailsCC(emails_cc);

    const sql = `
      UPDATE actividades_proveedores
      SET
        nombre            = $1,
        email_contacto    = $2,
        telefono_contacto = $3,
        emails_cc         = $4,
        updated_at        = NOW()
      WHERE id = $5
      RETURNING
        id,
        nombre,
        email_contacto,
        telefono_contacto,
        emails_cc,
        activo,
        created_at,
        updated_at
    `;
    const params = [
      String(nombre).trim(),
      String(email_contacto).trim(),
      telefono_contacto ? String(telefono_contacto).trim() : null,
      emailsArr,
      partnerId
    ];

    const { rows } = await pool.query(sql, params);
    const partner = rows[0];

    if (!partner) {
      return res.status(404).json({
        ok: false,
        error: 'Partner no encontrado'
      });
    }

    return res.json({
      ok: true,
      partner
    });
  } catch (err) {
    console.error('❌ actualizarPartner error:', err);

    if (err.code === '23505') {
      return res.status(409).json({
        ok: false,
        error: 'Ya existe un partner con esos datos'
      });
    }

    return res.status(500).json({
      ok: false,
      error: 'Error al actualizar partner'
    });
  }
}

/**
 * PATCH /api/registros/partners/:id/activo
 * Body opcional: { activo: true/false }
 * - Si mando activo, solo lo pone en ese valor.
 * - Si no mando nada, hace toggle.
 */
export async function cambiarEstatusPartner(req, res) {
  const { id } = req.params || {};
  const partnerId = Number(id);

  if (!Number.isFinite(partnerId) || partnerId <= 0) {
    return res.status(400).json({
      ok: false,
      error: 'ID inválido'
    });
  }

  const hasBodyFlag = Object.prototype.hasOwnProperty.call(req.body || {}, 'activo');
  const bodyActivo  = req.body?.activo;

  let sql;
  let params;

  if (hasBodyFlag && typeof bodyActivo === 'boolean') {
    sql = `
      UPDATE actividades_proveedores
      SET
        activo     = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        nombre,
        email_contacto,
        telefono_contacto,
        emails_cc,
        activo,
        created_at,
        updated_at
    `;
    params = [ bodyActivo, partnerId ];
  } else {
    sql = `
      UPDATE actividades_proveedores
      SET
        activo     = NOT activo,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        nombre,
        email_contacto,
        telefono_contacto,
        emails_cc,
        activo,
        created_at,
        updated_at
    `;
    params = [ partnerId ];
  }

  try {
    const { rows } = await pool.query(sql, params);
    const partner = rows[0];

    if (!partner) {
      return res.status(404).json({
        ok: false,
        error: 'Partner no encontrado'
      });
    }

    return res.json({
      ok: true,
      partner
    });
  } catch (err) {
    console.error('❌ cambiarEstatusPartner error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error al actualizar estatus del partner'
    });
  }
}

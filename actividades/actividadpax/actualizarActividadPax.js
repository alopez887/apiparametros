// actividades/actividadpax/actualizarActividadPax.js
import pool from '../../conexion.js';

/* =========================
 * Catálogos (para mensajes)
 * ========================= */
const LABELS = {
  anp:   { es: 'Adultos / Niños / Persona',          en: 'Adults / Children / Per person' },
  dur:   { es: 'Actividades por duración (tiempo)',  en: 'Activities by duration (time)' },
  pax:   { es: 'Actividades por PAX (grupo)',        en: 'Activities by PAX (group)' },
  combo: { es: 'Combos de actividades',              en: 'Activity combos' },
};

/** Valida un código en otras tablas (NO revisa tour_pax). */
async function codigoDetallesGlobalOtrasTablas(client, codigo) {
  const sql = `
    WITH q AS (SELECT LOWER(TRIM($1)) AS c)
    SELECT cat, nombre FROM (
      SELECT 'anp'  AS cat, COALESCE(t.nombre, t.codigo)         AS nombre FROM tours         t,  q WHERE LOWER(TRIM(t.codigo))  = q.c
      UNION ALL
      SELECT 'dur'  AS cat, COALESCE(td.nombre, td.codigo)       AS nombre FROM tourduracion  td, q WHERE LOWER(TRIM(td.codigo)) = q.c
      UNION ALL
      SELECT 'combo' AS cat, COALESCE(tc.nombre_combo, tc.codigo) AS nombre FROM tours_combo tc, q WHERE LOWER(TRIM(tc.codigo)) = q.c
    ) s
    LIMIT 50;
  `;
  const { rows } = await client.query(sql, [codigo]);
  return rows.map(r => ({
    table: r.cat,
    nombre: r.nombre,
    label_es: LABELS[r.cat].es,
    label_en: LABELS[r.cat].en,
  }));
}

/* =========================
 * Normalizadores
 * ========================= */
const toNumOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const trimOrNull = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

export async function actualizarActividadPax(req, res) {
  // Usamos el parámetro de ruta como CODIGO de la fila a actualizar
  const codigoPath = String(req.params?.id ?? '').trim(); // tu ruta es .../actividades-pax/:id pero es el código
  if (!codigoPath) {
    return res.status(400).json({ error: 'Código inválido en la ruta' });
  }

  // Body desde el iframe
  const b = req.body || {};
  const _codigo        = trimOrNull(b.codigo) ?? '';                 // nuevo código (puede cambiar)
  const _actividad     = trimOrNull(b.actividad ?? b.nombre) ?? '';
  const _moneda        = (trimOrNull(b.moneda) || 'USD').toUpperCase();
  const _proveedor     = trimOrNull(b.proveedor);

  const _duracion      = trimOrNull(b.duracion);
  const _duracion_es   = trimOrNull(b.duracion_es);
  const _capacidad     = trimOrNull(b.capacidad);
  const _capacidad_es  = trimOrNull(b.capacidad_es);

  const _precio        = toNumOrNull(b.precio_adulto ?? b.precio);
  const _precio_normal = toNumOrNull(b.precionormal_adulto ?? b.precio_normal);
  const _precio_opc    = toNumOrNull(b.precioopc_adulto ?? b.precioopc);

  const actividadIdRaw = trimOrNull(b.actividad_id);
  const _actividad_id  = actividadIdRaw ? Number(actividadIdRaw) : null;

  // Requeridos
  if (!_codigo || !_actividad || !_duracion || !_moneda) {
    return res.status(400).json({ error: 'Faltan campos requeridos: codigo, actividad, duracion, moneda' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 🔒 Lock por código destino (para evitar carreras)
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [_codigo]);

    // 1) Validación global del código en otras tablas (no tour_pax)
    const dupOtras = await codigoDetallesGlobalOtrasTablas(client, _codigo);
    if (dupOtras.length > 0) {
      const nombresES = [...new Set(dupOtras.map(d => d.label_es))].join(', ');
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Error: El código que intentas registrar ya existe en: ${nombresES}.`,
        code: 'duplicate',
        fields: { codigo: true },
        catalogs: dupOtras,
      });
    }

    // 2) Si cambian el código, asegurarnos que no exista otro registro en tour_pax con ese nuevo código
    //    (por si aún no tienes UNIQUE(codigo) en la tabla)
    const { rows: existeNuevo } = await client.query(
      `SELECT 1 FROM tour_pax WHERE LOWER(TRIM(codigo)) = LOWER(TRIM($1)) AND LOWER(TRIM(codigo)) <> LOWER(TRIM($2)) LIMIT 1`,
      [_codigo, codigoPath]
    );
    if (existeNuevo.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Error: El código que intentas registrar ya existe, favor de confirmar.',
        code: 'duplicate',
        fields: { codigo: true },
      });
    }

    // 3) Validación: duración duplicada dentro del mismo grupo (actividad_id), excluyendo esta misma fila (por codigoPath)
    if (_actividad_id !== null) {
      const { rows: du } = await client.query(
        `
        SELECT 1
          FROM tour_pax
         WHERE LOWER(TRIM(codigo)) <> LOWER(TRIM($1))
           AND actividad_id = $2::int
           AND LOWER(TRIM(duracion)) = LOWER(TRIM($3))
         LIMIT 1
        `,
        [codigoPath, _actividad_id, _duracion]
      );
      if (du.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Error: La duración que intentas registrar ya existe en ese grupo, favor de confirmar.',
          code: 'duplicate',
          fields: { duracion: true },
        });
      }
    }

    // 4) UPDATE por CODIGO en la ruta (codigoPath)
    const sql = `
      UPDATE public.tour_pax
         SET codigo        = $1,
             actividad     = $2,
             duracion      = $3,
             duracion_es   = $4,
             capacidad     = $5,
             capacidad_es  = $6,
             precio        = $7,
             precio_normal = $8,
             precioopc     = $9,
             moneda        = $10,
             proveedor     = $11,
             actividad_id  = $12,
             updated_at    = NOW()
       WHERE LOWER(TRIM(codigo)) = LOWER(TRIM($13))
       RETURNING
             codigo,            -- ← clave
             actividad,
             duracion, duracion_es,
             capacidad, capacidad_es,
             precio, precio_normal, precioopc,
             moneda, proveedor, actividad_id,
             created_at, updated_at, estatus
    `;
    const params = [
      _codigo,
      _actividad,
      _duracion,
      _duracion_es,
      _capacidad,
      _capacidad_es,
      _precio,
      _precio_normal,
      _precio_opc,
      _moneda,
      _proveedor,
      _actividad_id,
      codigoPath, // WHERE por el código original de la ruta
    ];

    const { rows } = await client.query(sql, params);
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Actividad no encontrada (código de ruta)' });
    }

    await client.query('COMMIT');
    // Mantengo estructura { ok, data }
    return res.json({ ok: true, data: rows[0] });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('💥 actualizarActividadPax error:', err);

    // Por si tienes UNIQUE(codigo) y lo dispara Postgres
    if (err && err.code === '23505') {
      return res.status(409).json({
        error: 'Error: El código que intentas registrar ya existe, favor de confirmar.',
        code: 'duplicate',
        fields: { codigo: true },
      });
    }

    return res.status(500).json({ error: 'Error al actualizar la actividad' });
  } finally {
    client.release();
  }
}

export default actualizarActividadPax;
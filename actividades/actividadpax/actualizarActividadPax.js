// actividades/actividadpax/actualizarActividadPax.js
import pool from '../../conexion.js';

/* =========================
 * Catálogos (mismos labels que en AGREGAR)
 * ========================= */
const LABELS = {
  anp:   { es: 'Adultos / Niños / Persona',          en: 'Adults / Children / Per person' },
  dur:   { es: 'Actividades por duración (tiempo)',  en: 'Activities by duration (time)' },
  pax:   { es: 'Actividades por PAX (grupo)',        en: 'Activities by PAX (group)' },
  combo: { es: 'Combos de actividades',              en: 'Activity combos' },
};

/**
 * Valida un código en TODAS las tablas, excluyendo el propio registro en tour_pax (selfId).
 * Devuelve: [{ table:'dur'|'pax'|'anp'|'combo', nombre, label_es, label_en }]
 */
async function codigoDetallesGlobalExceptSelfPax(client, codigo, selfId) {
  const sql = `
    WITH q AS (SELECT LOWER(TRIM($1)) AS c)
    SELECT cat, nombre FROM (
      -- tours (anp)
      SELECT 'anp'  AS cat, COALESCE(t.nombre, t.codigo) AS nombre
        FROM tours t, q
       WHERE LOWER(TRIM(t.codigo)) = q.c

      UNION ALL
      -- tourduracion (dur)
      SELECT 'dur'  AS cat, COALESCE(td.nombre, td.codigo) AS nombre
        FROM tourduracion td, q
       WHERE LOWER(TRIM(td.codigo)) = q.c

      UNION ALL
      -- tour_pax (pax) EXCLUYENDO el propio id
      SELECT 'pax'  AS cat, COALESCE(tp.actividad, tp.codigo) AS nombre
        FROM tour_pax tp, q
       WHERE LOWER(TRIM(tp.codigo)) = q.c
         AND tp.id <> $2::int

      UNION ALL
      -- tours_combo (combo)
      SELECT 'combo' AS cat, COALESCE(tc.nombre_combo, tc.codigo) AS nombre
        FROM tours_combo tc, q
       WHERE LOWER(TRIM(tc.codigo)) = q.c
    ) s
    LIMIT 50;
  `;
  const { rows } = await client.query(sql, [codigo, selfId]);
  return rows.map(r => ({
    table: r.cat,
    nombre: r.nombre,
    label_es: LABELS[r.cat].es,
    label_en: LABELS[r.cat].en,
  }));
}

/* =========================
 * Normalizadores (compat con AGREGAR)
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
  const { id } = req.params || {};
  const idNum = Number(id);

  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  // Body esperado desde tu iframe PAX
  const body = req.body || {};
  const _codigo        = trimOrNull(body.codigo) ?? '';
  const _actividad     = trimOrNull(body.nombre) ?? '';            // campo real en tour_pax = "actividad"
  const _moneda        = (trimOrNull(body.moneda) || 'USD').toUpperCase();
  const _proveedor     = trimOrNull(body.proveedor);
  const _duracion      = trimOrNull(body.duracion);                // requerido
  const _duracion_es   = trimOrNull(body.duracion_es);
  const _capacidad     = trimOrNull(body.capacidad);
  const _capacidad_es  = trimOrNull(body.capacidad_es);
  const _precio        = toNumOrNull(body.precio_adulto ?? body.precio);          // mapeo desde front
  const _precio_normal = toNumOrNull(body.precionormal_adulto ?? body.precio_normal);
  const _precio_opc    = toNumOrNull(body.precioopc_adulto ?? body.precioopc);
  const _actividad_id  = trimOrNull(body.actividad_id); // puede ser null (nuevo grupo implícito)

  // Requeridos para PAX: código, actividad, duración, moneda
  if (!_codigo || !_actividad || !_duracion || !_moneda) {
    return res.status(400).json({ error: 'Faltan campos requeridos: codigo, actividad, duracion, moneda' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 🔒 Evita carreras por el mismo código
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [_codigo]);

    // ===== Validación GLOBAL del código (excluye a sí mismo en tour_pax) =====
    const dupList = await codigoDetallesGlobalExceptSelfPax(client, _codigo, idNum);
    if (dupList.length > 0) {
      const nombresES = [...new Set(dupList.map(d => d.label_es))].join(', ');
      const msg = `Error: El código que intentas registrar ya existe en: ${nombresES}.`;
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: msg,
        code: 'duplicate',
        fields: { codigo: true },
        catalogs: dupList,
      });
    }

    // ===== Validación: duración duplicada dentro del mismo grupo (actividad_id) =====
    if (_actividad_id) {
      const sqlDupDur = `
        SELECT 1
          FROM tour_pax
         WHERE id <> $1
           AND COALESCE(actividad_id::text, '') = $2
           AND LOWER(TRIM(duracion)) = LOWER(TRIM($3))
         LIMIT 1;
      `;
      const { rows: du } = await client.query(sqlDupDur, [idNum, String(_actividad_id), _duracion]);
      if (du.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Error: La duración que intentas registrar ya existe en ese grupo, favor de confirmar.',
          code: 'duplicate',
          fields: { duracion: true },
        });
      }
    }

    // ===== UPDATE en tour_pax =====
    const sql = `
      UPDATE public.tour_pax
         SET codigo        = $1,
             actividad     = $2,
             duracion      = $3,
             duracion_es   = $4,
             capacidad     = $5,
             capacidad_es  = $6,
             precio        = $7,           -- numeric
             precio_normal = $8,           -- numeric
             precioopc     = $9,           -- numeric
             moneda        = $10,
             proveedor     = $11,
             actividad_id  = $12,
             updated_at    = NOW()
       WHERE id = $13
       RETURNING id, codigo, actividad, duracion, duracion_es,
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
      idNum,
    ];

    const { rows } = await client.query(sql, params);
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }

    await client.query('COMMIT');
    return res.json({ ok: true, data: rows[0] });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('💥 actualizarActividadPax error:', err);

    // Respaldo por UNIQUE
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
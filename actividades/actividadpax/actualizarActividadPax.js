// actividades/actividadestandar/actualizarActividad.js
import pool from '../../conexion.js';

/* =========================
 * Catálogos (mismos labels que en AGREGAR)
 * ========================= */
const LABELS = {
  anp:  { es: 'Adultos / Niños / Persona',          en: 'Adults / Children / Per person' },
  dur:  { es: 'Actividades por duración (tiempo)',  en: 'Activities by duration (time)' },
  pax:  { es: 'Actividades por PAX (grupo)',        en: 'Activities by PAX (group)' },
  combo:{ es: 'Combos de actividades',              en: 'Activity combos' },
};

/**
 * Valida un código en TODAS las tablas, excluyendo el propio registro de `tours` (anp)
 * Devuelve: [{ table:'dur'|'pax'|'anp'|'combo', nombre, label_es, label_en }]
 */
async function codigoDetallesGlobalExceptSelf(client, codigo, selfId) {
  const sql = `
    WITH q AS (SELECT LOWER(TRIM($1)) AS c)
    SELECT cat, nombre FROM (
      -- tours (anp) EXCLUYENDO el propio id
      SELECT 'anp' AS cat, COALESCE(t.nombre, t.codigo) AS nombre
        FROM tours t, q
       WHERE LOWER(TRIM(t.codigo)) = q.c
         AND t.id <> $2::int
      UNION ALL
      -- tourduracion (dur)
      SELECT 'dur' AS cat, COALESCE(td.nombre, td.codigo) AS nombre
        FROM tourduracion td, q
       WHERE LOWER(TRIM(td.codigo)) = q.c
      UNION ALL
      -- tour_pax (pax)
      SELECT 'pax' AS cat, COALESCE(tp.actividad, tp.codigo) AS nombre
        FROM tour_pax tp, q
       WHERE LOWER(TRIM(tp.codigo)) = q.c
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

export async function actualizarActividad(req, res) {
  const { id } = req.params || {};
  const idNum = Number(id);

  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  // Body esperado desde tu iframe
  const body = req.body || {};
  const _codigo     = trimOrNull(body.codigo) ?? '';
  const _nombre     = trimOrNull(body.nombre) ?? '';
  const _moneda     = (trimOrNull(body.moneda) || 'USD').toUpperCase();
  const _proveedor  = trimOrNull(body.proveedor);

  if (!_codigo || !_nombre || !_moneda) {
    return res.status(400).json({ error: 'Faltan campos requeridos: codigo, nombre, moneda' });
  }

  // Precios -> null si no hay
  const _precio_adulto         = toNumOrNull(body.precio_adulto);
  const _precio_nino           = toNumOrNull(body.precio_nino);
  const _precionormal_adulto   = toNumOrNull(body.precionormal_adulto);
  const _precionormal_nino     = toNumOrNull(body.precionormal_nino);
  const _precioopc_adulto      = toNumOrNull(body.precioopc_adulto);
  const _precioopc_nino        = toNumOrNull(body.precioopc_nino);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 🔒 Evita carreras por el mismo código (mismo patrón que AGREGAR)
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [_codigo]);

    // ===== Validación GLOBAL del código (excluye a sí mismo en tours) =====
    const dupList = await codigoDetallesGlobalExceptSelf(client, _codigo, idNum);
    if (dupList.length > 0) {
      const nombresES = [...new Set(dupList.map(d => d.label_es))].join(', ');
      // MISMA FRASE que en AGREGAR/DURACIÓN
      const msg = `Error: El código que intentas registrar ya existe en: ${nombresES}.`;

      await client.query('ROLLBACK');
      return res.status(409).json({
        error: msg,
        code: 'duplicate',
        fields: { codigo: true },
        catalogs: dupList, // Para que el front pueda mostrar etiquetas ES/EN si quiere
      });
    }

    // ===== UPDATE en tours =====
    const sql = `
      UPDATE public.tours
         SET codigo               = $1,
             nombre               = $2,
             moneda               = $3,
             precio_adulto        = $4::numeric::money,
             precio_nino          = $5::numeric::money,
             precionormal_adulto  = $6::numeric::money,
             precionormal_nino    = $7::numeric::money,
             precioopc_adulto     = $8::numeric::money,
             precioopc_nino       = $9::numeric::money,
             proveedor            = $10,
             updated_at           = NOW()
       WHERE id = $11
       RETURNING id, codigo, nombre, moneda, proveedor,
                 precio_adulto, precio_nino,
                 precionormal_adulto, precionormal_nino,
                 precioopc_adulto, precioopc_nino,
                 created_at, updated_at
    `;
    const params = [
      _codigo, _nombre, _moneda,
      _precio_adulto, _precio_nino,
      _precionormal_adulto, _precionormal_nino,
      _precioopc_adulto, _precioopc_nino,
      _proveedor, idNum
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
    console.error('💥 actualizarActividad error:', err);

    // Respaldo por UNIQUE (por si algo se cuela)
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

export default actualizarActividad;

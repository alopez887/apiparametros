// // /actividades/actividadduracion/actualizarActividadDuracion.js
import pool from '../../conexion.js';

/* =========================
 * Helpers (idénticos a AGREGAR)
 * ========================= */
const toNumberOrNull = (v) => {
  if (v === '' || v === undefined || v === null) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const toTextOrNull = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/**
 * Mismas etiquetas que en AGREGAR (anp | dur | pax | combo)
 */
const LABELS = {
  anp:  { es: 'Adultos / Niños / Persona',          en: 'Adults / Children / Per person' },
  dur:  { es: 'Actividades por duración (tiempo)',  en: 'Activities by duration (time)' },
  pax:  { es: 'Actividades por PAX (grupo)',        en: 'Activities by PAX (group)' },
  combo:{ es: 'Combos de actividades',              en: 'Activity combos' },
};

/**
 * Versión “global” como en AGREGAR, pero excluyendo el propio registro en tourduracion.
 * Devuelve mismo formato que crearActividadDuracion: [{ table:'dur'|'pax'|'anp'|'combo', nombre, label_es, label_en }]
 */
async function codigoDetallesGlobalExceptSelf(client, codigo, selfId) {
  // NOTA: Excluimos solo en tourduracion (td.id <> $2). En las demás tablas no aplica.
  const sql = `
    WITH q AS (SELECT LOWER(TRIM($1)) AS c)
    SELECT cat, nombre FROM (
      SELECT 'dur'  AS cat, COALESCE(td.nombre, td.codigo) AS nombre
        FROM tourduracion td, q
       WHERE LOWER(TRIM(td.codigo)) = q.c AND td.id <> $2
      UNION ALL
      SELECT 'pax'  AS cat, COALESCE(tp.actividad, tp.codigo) AS nombre
        FROM tour_pax tp, q
       WHERE LOWER(TRIM(tp.codigo)) = q.c
      UNION ALL
      SELECT 'anp'  AS cat, COALESCE(t.nombre, t.codigo) AS nombre
        FROM tours t, q
       WHERE LOWER(TRIM(t.codigo)) = q.c
      UNION ALL
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

export async function actualizarActividadDuracion(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Id requerido' });

  let {
    codigo,
    nombre,
    duracion,
    duracion_es,
    precio_adulto,
    precionormal_adulto,
    precioopc_adulto,
    moneda,
    proveedor,
    actividad_id, // opcional en edición (si no viene, se usa el del registro actual)
  } = req.body ?? {};

  // Normaliza (igual que en AGREGAR)
  codigo              = toTextOrNull(codigo);
  nombre              = toTextOrNull(nombre);
  duracion            = toTextOrNull(duracion);
  duracion_es         = toTextOrNull(duracion_es);
  precio_adulto       = toNumberOrNull(precio_adulto);
  precionormal_adulto = toNumberOrNull(precionormal_adulto);
  precioopc_adulto    = toNumberOrNull(precioopc_adulto);
  moneda              = (toTextOrNull(moneda) || 'USD').toUpperCase();
  proveedor           = toTextOrNull(proveedor);
  actividad_id        = toTextOrNull(actividad_id);

  if (!codigo || !nombre || !duracion || !moneda) {
    return res.status(400).json({ error: 'Faltan campos requeridos: codigo, nombre, duracion, moneda' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Traemos el registro actual para conocer su actividad_id si no viene en body
    const cur = await client.query(
      'SELECT id, actividad_id FROM tourduracion WHERE id = $1 LIMIT 1',
      [id]
    );
    if (!cur.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }
    const actividadIdActual = cur.rows[0].actividad_id;
    const actividadIdFinal = actividad_id ?? actividadIdActual;

    // 🔒 Evita carreras por el mismo código
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [codigo]);

    // ===== Validaciones previas (calcadas a AGREGAR) =====
    // (A) Global por código + catálogos donde existe (excluyendo este id en tourduracion)
    const dupList = await codigoDetallesGlobalExceptSelf(client, codigo, id);
    const existeCodigoGlobal = dupList.length > 0;

    // (B) (actividad_id, duracion) único en tourduracion (excluyendo este id)
    const chkDur = await client.query(
      `
        SELECT EXISTS(
          SELECT 1 FROM tourduracion
          WHERE actividad_id = $1
            AND LOWER(TRIM(duracion)) = LOWER(TRIM($2))
            AND id <> $3
        ) AS dup_duracion
      `,
      [actividadIdFinal, duracion, id]
    );
    const dupDuracion = !!chkDur.rows?.[0]?.dup_duracion;

    if (existeCodigoGlobal || dupDuracion) {
      const fields = {};
      const msgs = [];

      if (existeCodigoGlobal) {
        const nombresES = [...new Set(dupList.map(d => d.label_es))].join(', ');
        // MISMA FRASE que en AGREGAR:
        msgs.push(`Error: El código que intentas registrar ya existe en: ${nombresES}.`);
        fields.codigo = true;
      }
      if (dupDuracion) {
        // MISMA FRASE que en AGREGAR:
        msgs.push('Error: La duración que intentas registrar ya existe en ese grupo, favor de confirmar.');
        fields.duracion = true;
      }

      await client.query('ROLLBACK');
      return res.status(409).json({
        error: msgs.join(' '),
        code: 'duplicate',
        fields,
        catalogs: dupList, // mismo array para que el front arme el mensaje si lo necesita
      });
    }

    // ===== UPDATE =====
    const sql = `
      UPDATE tourduracion SET
        codigo = $1,
        nombre = $2,
        duracion = $3,
        duracion_es = $4,
        precio_adulto = $5,
        precionormal_adulto = $6,
        precioopc_adulto = $7,
        moneda = $8,
        proveedor = $9,
        actividad_id = COALESCE($10, actividad_id),
        update_at = NOW()
      WHERE id = $11
      RETURNING id, codigo, nombre, duracion, duracion_es,
                precio_adulto, precionormal_adulto, precioopc_adulto,
                moneda, proveedor, actividad_id, estatus, created_at, update_at;
    `;
    const params = [
      codigo, nombre, duracion, duracion_es,
      precio_adulto, precionormal_adulto, precioopc_adulto,
      moneda, proveedor, actividad_id, id
    ];
    const r = await client.query(sql, params);
    if (!r.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }

    await client.query('COMMIT');
    return res.json({ ok: true, msg: 'Actividad por duración actualizada', data: r.rows[0] });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ actualizarActividadDuracion:', err);

    // Respaldo por UNIQUE (mismas frases que en AGREGAR)
    if (err && err.code === '23505') {
      let msg = 'Registro duplicado.';
      const c = String(err.constraint || '').toLowerCase();
      const d = String(err.detail || '').toLowerCase();

      if (c.includes('uk_tourduracion_actividad_duracion') || d.includes('(actividad_id, duracion)')) {
        msg = 'Error: La duración que intentas registrar ya existe en ese grupo, favor de confirmar.';
        return res.status(409).json({ error: msg, code: 'duplicate', fields: { duracion: true } });
      }
      if (c.includes('tourduracion_codigo_key') || c.includes('uk_tourduracion_codigo') || d.includes('(codigo)')) {
        msg = 'Error: El código que intentas registrar ya existe, favor de confirmar.';
        return res.status(409).json({ error: msg, code: 'duplicate', fields: { codigo: true } });
      }
    }

    return res.status(500).json({ error: 'Error interno al actualizar actividad por duración' });
  } finally {
    client.release();
  }
}

export default actualizarActividadDuracion;

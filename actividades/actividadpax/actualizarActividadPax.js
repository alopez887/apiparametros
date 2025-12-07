// actividades/actividadpax/EstatusActividadPax.js
import pool from '../../conexion.js';

/**
 * PATCH /api/actividades-pax/:id/estatus
 * :id es el CODIGO (no ID numérico).
 * - Si body trae { estatus: true|false } fija ese valor.
 * - Si no trae "estatus", hace toggle del valor actual.
 * - Actualiza updated_at = NOW().
 * Respuesta: { ok:true, data:{ codigo, estatus, updated_at } }
 */
async function EstatusActividadPax(req, res) {
  const codigoPath = String(req.params?.id ?? '').trim();
  if (!codigoPath) {
    return res.status(400).json({ error: 'Código inválido en la ruta' });
  }

  const body = req.body || {};
  const estatusBody =
    typeof body.estatus === 'boolean' ? body.estatus : null; // null => toggle

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock por código para evitar condiciones de carrera
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [codigoPath]);

    // Obtener fila actual por CODIGO (case/trim-insensitive)
    const sel = await client.query(
      `
        SELECT codigo, estatus
          FROM public.tour_pax
         WHERE LOWER(TRIM(codigo)) = LOWER(TRIM($1))
         LIMIT 1
      `,
      [codigoPath]
    );

    if (sel.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Actividad no encontrada (código)' });
    }

    const current = sel.rows[0];
    const nuevoEstatus = estatusBody === null ? !Boolean(current.estatus) : estatusBody;

    const upd = await client.query(
      `
        UPDATE public.tour_pax
           SET estatus    = $1,
               updated_at = NOW()
         WHERE LOWER(TRIM(codigo)) = LOWER(TRIM($2))
         RETURNING codigo, estatus, updated_at
      `,
      [nuevoEstatus, codigoPath]
    );

    await client.query('COMMIT');
    return res.json({ ok: true, data: upd.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('💥 EstatusActividadPax error:', err);
    return res.status(500).json({ error: 'Error al cambiar el estatus' });
  } finally {
    client.release();
  }
}

// Exporta AMBOS: named y default (para que sirva con cualquier import)
export { EstatusActividadPax };
export default EstatusActividadPax;

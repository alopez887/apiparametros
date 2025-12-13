// actividades/actividadcombo/estatusCatalogoCompo.js
import pool from '../../conexion.js';

function toId(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : s;
}

async function hasColumn(client, table, column) {
  const q = await client.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND column_name=$2
      LIMIT 1`,
    [table, column]
  );
  return q.rows.length > 0;
}

/**
 * PATCH /api/catalogos-combo/:id/estatus
 * Body:
 * - { activo: true|false }   ó { estatus: true|false }
 * Si NO mandas boolean, hace toggle (invierte el actual).
 */
export async function estatusCatalogoCompo(req, res) {
  const idRel = toId(req.params.id);
  if (idRel == null) return res.status(400).json({ error: 'id_relacionado requerido en URL' });

  const body = req.body || {};
  const raw = (typeof body.activo === 'boolean') ? body.activo
           : (typeof body.estatus === 'boolean') ? body.estatus
           : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ex = await client.query(
      'SELECT 1 FROM tours_comboact WHERE id_relacionado = $1 LIMIT 1',
      [idRel]
    );
    if (!ex.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Catálogo no encontrado' });
    }

    const colEstatus = (await hasColumn(client, 'tours_comboact', 'estatus')) ? 'estatus'
                    : (await hasColumn(client, 'tours_comboact', 'activo')) ? 'activo'
                    : null;

    if (!colEstatus) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'La tabla tours_comboact no tiene columna estatus/activo' });
    }

    const hasUpdatedAt = await hasColumn(client, 'tours_comboact', 'updated_at');

    let nuevo = raw;
    if (nuevo === null) {
      // toggle
      const q = await client.query(
        `SELECT ${colEstatus} AS v
           FROM tours_comboact
          WHERE id_relacionado = $1
          LIMIT 1`,
        [idRel]
      );
      const actual = q.rows.length ? !!q.rows[0].v : true;
      nuevo = !actual;
    }

    const sql = hasUpdatedAt
      ? `UPDATE tours_comboact SET ${colEstatus} = $2, updated_at = NOW() WHERE id_relacionado = $1`
      : `UPDATE tours_comboact SET ${colEstatus} = $2 WHERE id_relacionado = $1`;

    await client.query(sql, [idRel, nuevo]);

    await client.query('COMMIT');
    return res.json({ ok: true, id_relacionado: idRel, [colEstatus]: nuevo });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('💥 estatusCatalogoCompo error:', err);
    return res.status(500).json({ error: 'Error al cambiar estatus del catálogo' });
  } finally {
    client.release();
  }
}

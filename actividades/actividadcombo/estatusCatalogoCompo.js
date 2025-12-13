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
 * Body opcional:
 * { activo: true|false }  o { estatus: true|false }
 *
 * Si NO mandas nada, hace TOGGLE.
 */
export async function estatusCatalogoCompo(req, res) {
  const idRel = toId(req.params.id);
  if (idRel == null) return res.status(400).json({ error: 'id_relacionado requerido en URL' });

  const b = req.body || {};

  const client = await pool.connect();
  try {
    const col =
      (await hasColumn(client, 'tours_comboact', 'estatus')) ? 'estatus' :
      (await hasColumn(client, 'tours_comboact', 'activo')) ? 'activo' :
      null;

    if (!col) return res.status(400).json({ error: 'La tabla tours_comboact no tiene columna estatus/activo.' });

    const q = await client.query(
      `SELECT ${col} AS v
         FROM public.tours_comboact
        WHERE id_relacionado = $1
        LIMIT 1`,
      [idRel]
    );
    if (!q.rows.length) return res.status(404).json({ error: 'Catálogo no encontrado' });

    const current = !!q.rows[0].v;

    // si viene valor explícito, lo usamos; si no, toggle
    let next;
    if (typeof b.activo === 'boolean') next = b.activo;
    else if (typeof b.estatus === 'boolean') next = b.estatus;
    else next = !current;

    await client.query(
      `UPDATE public.tours_comboact
          SET ${col} = $2
        WHERE id_relacionado = $1`,
      [idRel, next]
    );

    return res.json({ ok: true, id_relacionado: idRel, [col]: next });
  } catch (err) {
    console.error('💥 estatusCatalogoCompo error:', err);
    return res.status(500).json({ error: 'No se pudo cambiar el estatus del catálogo' });
  } finally {
    client.release();
  }
}

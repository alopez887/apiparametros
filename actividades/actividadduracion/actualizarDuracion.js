// /actividades/actividadduracion/actualizarDuracion.js
import pool from '../../conexion.js';

/**
 * PUT /api/actividades-duracion/:id
 * Body esperado:
 * {
 *   codigo, nombre, duracion, duracion_es,
 *   precio_adulto, precionormal_adulto, precioopc_adulto,
 *   moneda, proveedor,
 *   actividad_id,        // opcional: si es actividad nueva y pertenece a grupo existente
 *   groupMode            // 'existente' | 'nuevo' | 'none'  (opcional, ayuda a decidir el consecutivo)
 * }
 */
export async function actualizarActDuracion(req, res) {
  const { id } = req.params;

  // Validaciones básicas
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'Parámetro :id inválido' });
  }

  // Extrae campos del body
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
    actividad_id,
    groupMode, // 'existente' | 'nuevo' | 'none'
    estatus,   // opcional, por si decides permitir actualizarlo
  } = req.body ?? {};

  // Normaliza numéricos (permitiendo null)
  const toNumberOrNull = (v) => {
    if (v === '' || v === undefined || v === null) return null;
    const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  precio_adulto        = toNumberOrNull(precio_adulto);
  precionormal_adulto  = toNumberOrNull(precionormal_adulto);
  precioopc_adulto     = toNumberOrNull(precioopc_adulto);

  // Normaliza texto (trim) y deja null si vacío donde aplique
  const toTextOrNull = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  };

  codigo       = toTextOrNull(codigo);
  nombre       = toTextOrNull(nombre);
  duracion     = toTextOrNull(duracion);
  duracion_es  = toTextOrNull(duracion_es);
  moneda       = (toTextOrNull(moneda) || 'USD').toUpperCase();
  proveedor    = toTextOrNull(proveedor);

  // estatus opcional (booleano)
  const toBoolOrNull = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const s = String(v).toLowerCase();
    if (['1','true','t','activo','active'].includes(s)) return true;
    if (['0','false','f','inactivo','inactive'].includes(s)) return false;
    return null;
  };
  estatus = toBoolOrNull(estatus);

  // Lógica de actividad_id:
  // - Si groupMode === 'existente' y viene actividad_id => usarlo
  // - Si NO hay actividad_id o groupMode === 'nuevo' | 'none' => generar consecutivo MAX(actividad_id)+1
  try {
    let actividadIdFinal = null;

    const isGroupExistente = String(groupMode || '').toLowerCase() === 'existente';
    const isGroupNuevo     = String(groupMode || '').toLowerCase() === 'nuevo';
    const hasActividadId   = actividad_id !== undefined && actividad_id !== null && String(actividad_id).trim() !== '';

    if (isGroupExistente && hasActividadId) {
      const parsed = Number(actividad_id);
      actividadIdFinal = Number.isFinite(parsed) ? parsed : null;
      if (actividadIdFinal === null) {
        return res.status(400).json({ error: 'actividad_id inválido para groupMode "existente"' });
      }
    } else {
      // Generar consecutivo si no viene o si se indicó 'nuevo'/'none'
      const { rows } = await pool.query(
        'SELECT COALESCE(MAX(actividad_id), 0) + 1 AS next FROM tourduracion;'
      );
      actividadIdFinal = Number(rows?.[0]?.next) || 1;
    }

    // Construye UPDATE; solo actualiza columnas relevantes y marca update_at = NOW()
    // Nota: estatus es opcional. Si viene null, no lo sobre-escribimos.
    // Para esto, hacemos dos variantes del SQL.
    const baseParams = [
      codigo,              // $1
      nombre,              // $2
      duracion,            // $3
      duracion_es,         // $4
      precio_adulto,       // $5
      precionormal_adulto, // $6
      precioopc_adulto,    // $7
      moneda,              // $8
      proveedor,           // $9
      actividadIdFinal,    // $10
      idNum,               // $11
    ];

    let sql = `
      UPDATE tourduracion
      SET
        codigo = $1,
        nombre = $2,
        duracion = $3,
        duracion_es = $4,
        precio_adulto = $5,
        precionormal_adulto = $6,
        precioopc_adulto = $7,
        moneda = $8,
        proveedor = $9,
        actividad_id = $10,
        update_at = NOW()
      WHERE id = $11
      RETURNING id, codigo, actividad_id, update_at AS updated_at;
    `;
    let params = baseParams;

    if (estatus !== null) {
      // Insertamos 'estatus = $12' antes de update_at y movemos el id al último placeholder
      sql = `
        UPDATE tourduracion
        SET
          codigo = $1,
          nombre = $2,
          duracion = $3,
          duracion_es = $4,
          precio_adulto = $5,
          precionormal_adulto = $6,
          precioopc_adulto = $7,
          moneda = $8,
          proveedor = $9,
          actividad_id = $10,
          estatus = $11,
          update_at = NOW()
        WHERE id = $12
        RETURNING id, codigo, actividad_id, update_at AS updated_at, estatus;
      `;
      params = [
        ...baseParams.slice(0, 10),
        estatus, // $11
        idNum,   // $12
      ];
    }

    const result = await pool.query(sql, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Actividad (duración) no encontrada' });
    }

    return res.json({
      ok: true,
      msg: 'Actividad por duración actualizada',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('❌ actualizarActDuracion:', err);
    return res.status(500).json({ error: 'Error al actualizar actividad por duración' });
  }
}

export default actualizarActDuracion;

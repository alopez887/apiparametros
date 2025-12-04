// /actividades/actividadestandar/actualizarActividad.js
import pool from '../../conexion.js';

export async function actualizarActividad(req, res) {
  try {
    const { id } = req.params;
    const idNum = Number(id);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // Body esperado desde tu iframe
    const {
      codigo = '',
      nombre = '',
      moneda,                 // si no llega, se fuerza a 'USD'
      proveedor = null,

      // Precios: pueden venir como string/number o vacíos -> null
      precio_adulto = null,
      precio_nino = null,
      precionormal_adulto = null,
      precionormal_nino = null,
      precioopc_adulto = null,
      precioopc_nino = null
    } = req.body || {};

    const _moneda = String(moneda || 'USD').trim().toUpperCase();
    const _codigo = String(codigo || '').trim();
    const _nombre = String(nombre || '').trim();
    const _proveedor = (proveedor === null || proveedor === undefined || proveedor === '')
      ? null
      : String(proveedor).trim();

    if (!_codigo || !_nombre || !_moneda) {
      return res.status(400).json({ error: 'Faltan campos requeridos: codigo, nombre, moneda' });
    }

    // Normaliza a null los valores que vengan vacíos
    const n = (v) => (v === '' || v === null || v === undefined ? null : v);

    const params = [
      _codigo,             // $1
      _nombre,             // $2
      _moneda,             // $3
      n(precio_adulto),    // $4
      n(precio_nino),      // $5
      n(precionormal_adulto), // $6
      n(precionormal_nino),   // $7
      n(precioopc_adulto),    // $8
      n(precioopc_nino),      // $9
      _proveedor,          // $10
      idNum                // $11
    ];

    // IMPORTANTE: los campos *money* se asignan como $x::numeric::money para tolerar números/strings limpios.
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

    const { rows } = await pool.query(sql, params);

    if (!rows.length) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }

    return res.json({ ok: true, data: rows[0] });
  } catch (err) {
    // Código de error por violación de UNIQUE (por ejemplo, en "codigo")
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'El código ya existe (violación de UNIQUE)' });
    }
    console.error('💥 actualizarActividad error:', err);
    return res.status(500).json({ error: 'Error al actualizar la actividad' });
  }
}

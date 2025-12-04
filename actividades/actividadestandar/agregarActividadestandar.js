// actividades/actividadestandar/agregarActividadestandar.js
import pool from '../../conexion.js';

export async function agregarActividadEstandar(req, res) {
  try {
    const body = req.body || {};

    // Normalizadores
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

    // Requeridos
    const codigo  = trimOrNull(body.codigo);
    const nombre  = trimOrNull(body.nombre);
    const moneda  = trimOrNull(body.moneda) || 'USD';

    if (!codigo || !nombre || !moneda) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: codigo, nombre y moneda.' });
    }

    // Opcionales numéricos (se guardan null cuando no hay valor)
    const precio_adulto        = toNumOrNull(body.precio_adulto);
    const precio_nino          = toNumOrNull(body.precio_nino);
    const precionormal_adulto  = toNumOrNull(body.precionormal_adulto);
    const precionormal_nino    = toNumOrNull(body.precionormal_nino);
    const precioopc_adulto     = toNumOrNull(body.precioopc_adulto);
    const precioopc_nino       = toNumOrNull(body.precioopc_nino);

    // Proveedor opcional
    const proveedor = trimOrNull(body.proveedor);

    // Query parametrizada
    const text = `
      INSERT INTO public.tours
        (codigo, nombre, precio_adulto, precio_nino, precionormal_adulto, precionormal_nino,
         precioopc_adulto, precioopc_nino, moneda, proveedor)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING
        id, codigo, nombre, precio_adulto, precio_nino,
        precionormal_adulto, precionormal_nino, precioopc_adulto, precioopc_nino,
        moneda, proveedor, created_at, updated_at
    `;

    const params = [
      codigo, nombre,
      precio_adulto, precio_nino,
      precionormal_adulto, precionormal_nino,
      precioopc_adulto, precioopc_nino,
      moneda, proveedor
    ];

    const { rows } = await pool.query(text, params);
    const data = rows?.[0] ?? null;

    return res.status(201).json({ ok: true, data });
  } catch (err) {
    // Manejo de violación de unicidad (si tienes UNIQUE en codigo)
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'El código ya existe.' });
    }
    console.error('💥 agregarActividadEstandar error:', err);
    return res.status(500).json({ error: 'Error al crear la actividad.' });
  }
}

export default agregarActividadEstandar;

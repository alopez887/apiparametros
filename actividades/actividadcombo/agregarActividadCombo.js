// actividades/actividadcombo/agregarActividadCombo.js
import pool from '../../conexion.js';

/**
 * POST /api/combos/agregar-combo
 * Body esperado:
 *  {
 *    codigo: string (req),
 *    moneda: "USD" | ... (opcional, default "USD"),
 *    nombre_combo: string (al menos uno de nombre_combo / nombre_combo_es),
 *    nombre_combo_es: string,
 *    cantidad_actividades: number (int >=1, req),
 *    precio: number (>=0),
 *    precio_normal: number (>=0),
 *    precio_opc: number (>=0),
 *    proveedor?: string | null
 *  }
 */
export async function agregarActividadCombo(req, res) {
  try {
    const b = req.body || {};

    // Normalizaciones básicas
    const codigo = String(b.codigo || '').trim().toUpperCase();
    const moneda = String(b.moneda || 'USD').trim().toUpperCase();

    const nombre_combo    = String(b.nombre_combo || '').trim();
    const nombre_combo_es = String(b.nombre_combo_es || '').trim();
    const proveedor       = (b.proveedor == null ? null : String(b.proveedor).trim()) || null;

    const cantidad_actividades = Number.isFinite(Number(b.cantidad_actividades))
      ? parseInt(b.cantidad_actividades, 10)
      : NaN;

    const precio        = Number.isFinite(Number(b.precio))        ? Number(b.precio)        : 0;
    const precio_normal = Number.isFinite(Number(b.precio_normal)) ? Number(b.precio_normal) : 0;
    const precioopc     = Number.isFinite(Number(b.precio_opc))    ? Number(b.precio_opc)    : 0;

    // Validaciones mínimas
    if (!codigo) {
      return res.status(400).json({ ok: false, error: 'El campo "codigo" es requerido.' });
    }
    if (!nombre_combo && !nombre_combo_es) {
      return res.status(400).json({ ok: false, error: 'Debe indicar "nombre_combo" o "nombre_combo_es".' });
    }
    if (!Number.isFinite(cantidad_actividades) || cantidad_actividades < 1) {
      return res.status(400).json({ ok: false, error: 'El campo "cantidad_actividades" debe ser un entero >= 1.' });
    }
    if (!moneda) {
      return res.status(400).json({ ok: false, error: 'El campo "moneda" es requerido.' });
    }

    // Verificación de duplicados de código across catálogos
    // Map a etiquetas para mensaje consistente con el front
    const dupSql = `
      SELECT 'ANP'::text AS catalog, codigo FROM public.tours WHERE UPPER(codigo) = $1
      UNION ALL
      SELECT 'DURACION'::text AS catalog, codigo FROM public.tourduracion WHERE UPPER(codigo) = $1
      UNION ALL
      SELECT 'PAX'::text AS catalog, codigo FROM public.tour_pax WHERE UPPER(codigo) = $1
      UNION ALL
      SELECT 'COMBO'::text AS catalog, codigo FROM public.tours_combo WHERE UPPER(codigo) = $1
    `;
    const dupCheck = await pool.query(dupSql, [codigo]);
    if (dupCheck.rows && dupCheck.rows.length) {
      // Construimos etiquetas legibles
      const labelMap = {
        ANP:        'Adultos/Niños/Persona',
        DURACION:   'Duración',
        PAX:        'PAX',
        COMBO:      'Combos'
      };
      const labels = [...new Set(dupCheck.rows.map(r => labelMap[r.catalog] || r.catalog))];
      return res.status(409).json({
        ok: false,
        error: 'Código duplicado en otros catálogos.',
        catalogs: labels
      });
    }

    // Insert en tours_combo
    // estatus: true por defecto (activo)
    const insertSql = `
      INSERT INTO public.tours_combo
        (codigo, moneda, nombre_combo, nombre_combo_es, cantidad_actividades,
         precio, precio_normal, precioopc, proveedor, estatus, created_at, updated_at)
      VALUES
        ($1,     $2,     $3,           $4,             $5,
         $6,     $7,           $8,      $9,        TRUE,    NOW(),     NOW())
      RETURNING
        id, codigo, moneda, nombre_combo, nombre_combo_es, cantidad_actividades,
        precio, precio_normal, precioopc, proveedor, estatus, created_at, updated_at
    `;

    const params = [
      codigo,
      moneda,
      nombre_combo || null,
      nombre_combo_es || null,
      cantidad_actividades,
      precio,
      precio_normal,
      precioopc,
      proveedor
    ];

    const { rows } = await pool.query(insertSql, params);
    const row = rows?.[0];

    return res.status(201).json({
      ok: true,
      data: row
    });
  } catch (err) {
    console.error('❌ agregarActividadCombo:', err);
    // Si el esquema ya tiene una unique constraint en tours_combo(codigo)
    // atrapamos violación de unique para responder 409
    if (err && err.code === '23505') {
      return res.status(409).json({
        ok: false,
        error: 'El código ya existe en Combos.'
      });
    }
    return res.status(500).json({
      ok: false,
      error: 'No se pudo crear el combo'
    });
  }
}

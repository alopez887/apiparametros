// ./actividades/actividadpax/listarActividadesPax.js
import pool from '../../conexion.js'; // 👈 OJO: subir dos niveles desde actividadestandar

export const listarActividadesPax = async (req, res) => {
  try {
    // 👇 Ajusta el nombre de la tabla y columna de orden según tu DB.
    // Comentario en server.js dice: "tabla tour_pax", así que usamos esa.
    const query = `
      SELECT *
      FROM tour_pax
      ORDER BY codigo ASC
    `;

    const { rows } = await pool.query(query);

    return res.json({
      ok: true,
      data: rows,
    });
  } catch (error) {
    console.error('❌ listarActividadesPax error:', error);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error al obtener la lista de actividades',
      error: error.message,
    });
  }
};

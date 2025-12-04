// ./actividades/actividadestandar/listarActividades.js
import pool from '../../conexion.js'; // 👈 OJO: subir dos niveles desde actividadestandar

export const listarActividadesDuracion = async (req, res) => {
  try {
    // 👇 Ajusta el nombre de la tabla y columna de orden según tu DB.
    // Comentario en server.js dice: "tabla tours", así que usamos esa.
    const query = `
      SELECT *
      FROM tourduracion
      ORDER BY id ASC
    `;

    const { rows } = await pool.query(query);

    return res.json({
      ok: true,
      data: rows,
    });
  } catch (error) {
    console.error('❌ listarActividades error:', error);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error al obtener la lista de actividades',
      error: error.message,
    });
  }
};

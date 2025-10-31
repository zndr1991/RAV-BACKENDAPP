const express = require('express');
const router = express.Router();
const pool = require('../server').pool;
const io = require('../server').io;

// Convierte serial de Excel a string dd/mm/yyyy hh:mm:ss sin desfases por zona horaria
function excelDateToString(serial) {
  if (typeof serial !== 'number' || Number.isNaN(serial)) return serial;

  const milliseconds = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (value) => value.toString().padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

const columnasFecha = [
  "FECHA_COTIZACION", "FECHA_PEDIDO", "PROMESA_DE_ENTREGA", "FECHA_CONFIRMACION_DE_PIEZA",
  "FECHA_CANCELACION_DE_PIEZA", "FECHA_FACTURACION_DE_PIEZA", "FECHA_ENTREGA_DE_PIEZA",
  "FECHA_RECEPCION_DE_PIEZA"
];

// Guardar datos (sobrescribe todo: elimina y vuelve a insertar)
router.post('/guardar-excel', async (req, res) => {
  try {
    let datos = req.body;
    // No ordena ni elimina el sort, mantiene el orden original del archivo

    // No borra toda la tabla, así conserva los registros existentes y solo actualiza los que subes
    for (const row of datos) {
      try {
        columnasFecha.forEach(col => {
          if (typeof row[col] === 'number' || (typeof row[col] === 'string' && !isNaN(row[col]) && row[col].trim() !== '')) {
            row[col] = excelDateToString(Number(row[col]));
          }
        });
        // Conserva el campo id
        const keys = Object.keys(row);
        const values = keys.map(k => row[k]);
        const columns = keys.map(k => `"${k}"`).join(',');
        const params = keys.map((_, i) => `$${i + 1}`).join(',');
        // Si el id ya existe, actualiza el registro
        const updateClause = keys
          .filter(k => k !== 'id')
          .map((k, i) => `"${k}" = EXCLUDED."${k}"`)
          .join(', ');
        await pool.query(
          `INSERT INTO excel_data (${columns}) VALUES (${params})
           ON CONFLICT (id) DO UPDATE SET ${updateClause}`,
          values
        );
      } catch (filaError) {
        console.error('Error al insertar fila:', row, filaError);
        throw filaError;
      }
    }
  io.emit('excel_data_updated', { type: 'update' });
  res.json({ ok: true });
  } catch (err) {
    console.error('Error general en guardar-excel:', err);
    res.status(500).json({ error: err.message });
  }
});

// Obtener datos (sin filtro de fecha)
router.get('/obtener-excel', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM excel_data ORDER BY id`
    );
    res.json(result.rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Borrar varios registros por ID
router.delete('/borrar', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ ok: false, mensaje: 'No se enviaron IDs' });
  }
  try {
    await pool.query(
      `DELETE FROM excel_data WHERE id = ANY($1::int[])`,
      [ids]
    );
    io.emit('excel_data_updated', { type: 'delete', ids });
    res.json({ ok: true, mensaje: 'Registros borrados' });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al borrar' });
  }
});

// Actualizar un campo de un registro
router.put('/actualizar', async (req, res) => {
  const { id, field, nuevoValor } = req.body;
  if (!id || !field || !nuevoValor) {
    return res.status(400).json({ ok: false, mensaje: 'Faltan datos' });
  }
  try {
    await pool.query(
      `UPDATE excel_data SET "${field}" = $1 WHERE id = $2`,
      [nuevoValor, id]
    );

    // avisa a los demás clientes
    io.emit('celda_actualizada', {
      id,
      field,
      value: nuevoValor,
      compaq: field === 'CODIGO' ? (nuevoValor?.trim() ? 'GENERAR' : '') : undefined
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar' });
  }
});

router.post('/actualizar-celda', async (req, res) => {
  try {
    const { id, field, value } = req.body;
    if (!id || !field) return res.status(400).json({ ok: false, mensaje: 'Faltan datos' });

    const nuevoValor = value ?? '';

    await pool.query(
      `UPDATE excel_data SET "${field}" = $1 WHERE id = $2`,
      [nuevoValor, id]
    );

    io.emit('celda_actualizada', {
      id,
      field,
      value: nuevoValor,
      compaq: field === 'CODIGO' ? (String(nuevoValor).trim() ? 'GENERAR' : '') : undefined
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar' });
  }
});

module.exports = router;
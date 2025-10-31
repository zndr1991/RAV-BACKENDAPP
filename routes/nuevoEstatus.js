const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { pool, io } = require('../server');

const TABLA_NUEVO_ESTATUS = 'nuevo_estatus';
const LAST_UPDATE_FILE = path.resolve(__dirname, '..', 'nuevo_estatus_last_update.json');

let lastNuevoEstatusUpdate = null;

const loadLastUpdateTimestamp = () => {
  try {
    if (!fs.existsSync(LAST_UPDATE_FILE)) return;
    const raw = fs.readFileSync(LAST_UPDATE_FILE, 'utf8');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.lastUpdated === 'string') {
      lastNuevoEstatusUpdate = parsed.lastUpdated;
    }
  } catch (err) {
    console.warn('No se pudo cargar la última actualización de nuevo estatus:', err);
  }
};

const persistLastUpdateTimestamp = async (timestamp) => {
  try {
    await fs.promises.writeFile(
      LAST_UPDATE_FILE,
      JSON.stringify({ lastUpdated: timestamp }),
      'utf8'
    );
  } catch (err) {
    console.warn('No se pudo guardar la última actualización de nuevo estatus:', err);
  }
};

loadLastUpdateTimestamp();

const columnasFecha = [
  'FECHA_COTIZACION',
  'FECHA_PEDIDO',
  'PROMESA_DE_ENTREGA',
  'FECHA_CONFIRMACION_DE_PIEZA',
  'FECHA_CANCELACION_DE_PIEZA',
  'FECHA_FACTURACION_DE_PIEZA',
  'FECHA_ENTREGA_DE_PIEZA',
  'FECHA_RECEPCION_DE_PIEZA'
];

const excelDateToString = (serial) => {
  if (typeof serial !== 'number') return serial;
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  const fractionalDay = serial - Math.floor(serial);
  let totalSeconds = Math.round(fractionalDay * 86400);
  const seconds = totalSeconds % 60;
  totalSeconds = (totalSeconds - seconds) / 60;
  const minutes = totalSeconds % 60;
  const hours = (totalSeconds - minutes) / 60;
  date.setHours(hours, minutes, seconds, 0);
  const pad = (value) => value.toString().padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const parseFechaDDMMYYYY = (valor) => {
  if (!valor || typeof valor !== 'string') return '';
  const [fecha, hora = '00:00:00'] = valor.split(' ');
  const [dia, mes, anio] = (fecha || '').split('/');
  if (!dia || !mes || !anio) return '';
  const [hh = '00', mm = '00', ss = '00'] = hora.split(':');
  const pad = (val) => val.toString().padStart(2, '0');
  return `${pad(Number(dia))}/${pad(Number(mes))}/${anio} ${pad(Number(hh))}:${pad(Number(mm))}:${pad(Number(ss))}`;
};

router.get('/obtener', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ${TABLA_NUEVO_ESTATUS} ORDER BY id DESC`
    );
    res.json({
      rows: result.rows || [],
      lastUpdated: lastNuevoEstatusUpdate
    });
  } catch (err) {
    console.error('Error en /nuevo-estatus/obtener:', err);
    res.json({ rows: [], lastUpdated: lastNuevoEstatusUpdate });
  }
});

router.post('/insertar', async (req, res) => {
  const datos = Array.isArray(req.body) ? req.body : [];
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Reemplazar la tabla completa con el nuevo contenido cargado desde Excel.
    await client.query(`DELETE FROM ${TABLA_NUEVO_ESTATUS}`);

    for (const rowOriginal of datos) {
      const row = { ...rowOriginal };
      delete row.id;
      columnasFecha.forEach(col => {
        if (typeof row[col] === 'number' || (typeof row[col] === 'string' && !isNaN(row[col]) && row[col].trim() !== '')) {
          row[col] = excelDateToString(Number(row[col]));
        } else if (typeof row[col] === 'string') {
          row[col] = parseFechaDDMMYYYY(row[col]);
        } else {
          row[col] = '';
        }
      });

      const keys = Object.keys(row);
      if (!keys.length) continue;
      const values = keys.map(k => row[k]);
      const columns = keys.map(k => `"${k}"`).join(',');
      const params = keys.map((_, i) => `$${i + 1}`).join(',');

      try {
        await client.query(
          `INSERT INTO ${TABLA_NUEVO_ESTATUS} (${columns}) VALUES (${params})`,
          values
        );
      } catch (err) {
        console.error('Error al insertar fila en nuevo_estatus:', row, err);
      }
    }

    await client.query('COMMIT');

    lastNuevoEstatusUpdate = new Date().toISOString();
    await persistLastUpdateTimestamp(lastNuevoEstatusUpdate);

    io.emit('nuevo_estatus_updated', { lastUpdated: lastNuevoEstatusUpdate });
    res.json({ ok: true, lastUpdated: lastNuevoEstatusUpdate });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al insertar en nuevo_estatus:', err);
    res.status(500).json({ ok: false, mensaje: 'Error al insertar en nuevo estatus.' });
  } finally {
    client.release();
  }
});

router.delete('/borrar', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ ok: false, mensaje: 'No se enviaron IDs' });
  }

  try {
    await pool.query(
      `DELETE FROM ${TABLA_NUEVO_ESTATUS} WHERE id = ANY($1::int[])`,
      [ids]
    );
    io.emit('nuevo_estatus_updated');
    res.json({ ok: true, mensaje: 'Registros borrados' });
  } catch (err) {
    console.error('Error al borrar en nuevo_estatus:', err);
    res.status(500).json({ ok: false, mensaje: 'Error al borrar' });
  }
});

module.exports = router;

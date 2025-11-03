const express = require('express');
const router = express.Router();
const { pool, io } = require('../server');

const TABLA_BASE = 'base_datos';
const TABLA_ORDENES = 'ordenes_proveedor';
const ESTATUS_EDITABLE_COLUMNS = new Set(['ESTATUS_LOCAL', 'ESTATUS_FORANEO', 'ESTATUS2', 'LOCALIDAD']);
const CAPTURA_EDITABLE_COLUMNS = new Set(['CODIGO', 'CHOFER']);

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

const normalizarPedido = (valor) => {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim().replace(/\.0+$/, '');
};

const excelDateToString = (serial) => {
  if (typeof serial !== 'number' || Number.isNaN(serial)) return serial;

  const milliseconds = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (value) => value.toString().padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
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

async function sincronizarPedidosOc(client) {
  await client.query(`
    UPDATE ${TABLA_BASE} AS b
       SET "OC" = o."ORDEN_PROVEEDOR"
      FROM ${TABLA_ORDENES} AS o
     WHERE regexp_replace(TRIM(CAST(b."PEDIDO" AS TEXT)), '\\.0+$', '') =
           regexp_replace(TRIM(CAST(o."PEDIDO" AS TEXT)), '\\.0+$', '');
  `);
}

async function limpiarOcParaPedidos(client, pedidosNormalizados) {
  if (!pedidosNormalizados.length) return;
  await client.query(`
    UPDATE ${TABLA_BASE}
       SET "OC" = ''
     WHERE regexp_replace(TRIM(CAST("PEDIDO" AS TEXT)), '\\.0+$', '') = ANY($1)
  `, [pedidosNormalizados]);
}

// Obtener registros (sin filtro de fecha)
router.get('/obtener', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ${TABLA_BASE} ORDER BY id DESC`
    );
    res.json(result.rows || []);
  } catch (err) {
    console.error('Error en /obtener:', err);
    res.json([]);
  }
});

router.get('/captura/generar', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
         FROM ${TABLA_BASE}
        WHERE UPPER(TRIM(COALESCE(CAST("COMPAQ" AS TEXT), ''))) = 'GENERAR'
        ORDER BY id DESC`
    );
    res.json(result.rows || []);
  } catch (err) {
    console.error('Error en /captura/generar:', err);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener datos para captura.' });
  }
});

router.put('/captura/marcar-generado', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ ok: false, mensaje: 'No se enviaron registros.' });
  }

  try {
    const result = await pool.query(
      `UPDATE ${TABLA_BASE}
          SET "COMPAQ" = 'GENERADO'
        WHERE id = ANY($1::int[])`,
      [ids]
    );
    io.emit('excel_data_updated');
    res.json({ ok: true, actualizados: result.rowCount || 0 });
  } catch (err) {
    console.error('Error en /captura/marcar-generado:', err);
    res.status(500).json({ ok: false, mensaje: 'No se pudo actualizar los registros.' });
  }
});

router.post('/captura/actualizar-celda', async (req, res) => {
  const { id, field, value } = req.body || {};

  const numericId = Number.isInteger(id) ? id : parseInt(id, 10);
  if (!numericId) {
    return res.status(400).json({ ok: false, mensaje: 'ID inválido.' });
  }

  if (!field || !CAPTURA_EDITABLE_COLUMNS.has(field)) {
    return res.status(400).json({ ok: false, mensaje: 'Campo no permitido.' });
  }

  const nuevoValor = value === null || value === undefined ? '' : String(value).trim();

  try {
    const result = await pool.query(
      `UPDATE ${TABLA_BASE}
          SET "${field}" = $1
        WHERE id = $2`,
      [nuevoValor, numericId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, mensaje: 'Registro no encontrado.' });
    }

    io.emit('excel_data_updated', {
      type: 'captura_cell_update',
      id: numericId,
      field,
      value: nuevoValor
    });

    res.json({ ok: true, id: numericId, field, value: nuevoValor });
  } catch (err) {
    console.error('Error en /captura/actualizar-celda:', err);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar el registro.' });
  }
});

// Insertar registros (convertir fechas a string)
router.post('/insertar', async (req, res) => {
  const datos = Array.isArray(req.body) ? req.body : [];
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (let row of datos) {
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
      const values = keys.map(k => row[k]);
      const columns = keys.map(k => `"${k}"`).join(',');
      const params = keys.map((_, i) => `$${i + 1}`).join(',');

      try {
        await client.query(
          `INSERT INTO ${TABLA_BASE} (${columns}) VALUES (${params})`,
          values
        );
      } catch (err) {
        console.error('Error al insertar fila en base_datos:', row, err);
      }
    }

    await sincronizarPedidosOc(client);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al insertar en base_datos:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Borrar registros
router.delete('/borrar', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ ok: false, mensaje: 'No se enviaron IDs' });
  }
  try {
    await pool.query(
      `DELETE FROM ${TABLA_BASE} WHERE id = ANY($1::int[])`,
      [ids]
    );
    res.json({ ok: true, mensaje: 'Registros borrados' });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al borrar' });
  }
});

router.put('/actualizar-estatus', async (req, res) => {
  const { id, field, value } = req.body || {};

  const numericId = Number.isInteger(id) ? id : parseInt(id, 10);
  if (!numericId) {
    return res.status(400).json({ ok: false, mensaje: 'ID inválido.' });
  }

  if (!field || !ESTATUS_EDITABLE_COLUMNS.has(field)) {
    return res.status(400).json({ ok: false, mensaje: 'Campo no permitido.' });
  }

  const nuevoValor = value === null || value === undefined ? '' : String(value);

  try {
    const result = await pool.query(
      `UPDATE ${TABLA_BASE}
          SET "${field}" = $1
        WHERE id = $2`,
      [nuevoValor, numericId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, mensaje: 'Registro no encontrado.' });
    }

    io.emit('excel_data_updated', {
      type: 'estatus_update',
      id: numericId,
      field,
      value: nuevoValor
    });

    res.json({ ok: true, id: numericId, field, value: nuevoValor });
  } catch (err) {
    console.error('Error al actualizar estatus:', err);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar estatus.' });
  }
});

// -------- ORDENES PROVEEDOR --------

router.get('/ordenes-proveedor/obtener', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, "PEDIDO", "ORDEN_PROVEEDOR" FROM ${TABLA_ORDENES} ORDER BY id DESC`
    );
    res.json(result.rows || []);
  } catch (err) {
    console.error('Error en /ordenes-proveedor/obtener:', err);
    res.json([]);
  }
});

router.post('/ordenes-proveedor/insertar', async (req, res) => {
  const filas = Array.isArray(req.body) ? req.body : [];
  if (!filas.length) {
    return res.status(400).json({ ok: false, mensaje: 'No se enviaron registros.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const fila of filas) {
      const pedidoNormalizado = normalizarPedido(fila.PEDIDO);
      const ordenProveedor = fila.ORDEN_PROVEEDOR ? String(fila.ORDEN_PROVEEDOR).trim() : '';
      if (!pedidoNormalizado || !ordenProveedor) continue;

      await client.query(
        `DELETE FROM ${TABLA_ORDENES}
          WHERE regexp_replace(TRIM(CAST("PEDIDO" AS TEXT)), '\\.0+$', '') = $1`,
        [pedidoNormalizado]
      );

      await client.query(
        `INSERT INTO ${TABLA_ORDENES} ("PEDIDO", "ORDEN_PROVEEDOR")
         VALUES ($1, $2)`,
        [pedidoNormalizado, ordenProveedor]
      );
    }

    await sincronizarPedidosOc(client);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al insertar ordenes_proveedor:', err);
    res.status(500).json({ ok: false, mensaje: 'Error en la carga masiva.' });
  } finally {
    client.release();
  }
});

router.delete('/ordenes-proveedor/borrar', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ ok: false, mensaje: 'No se enviaron IDs' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id,
              regexp_replace(TRIM(CAST("PEDIDO" AS TEXT)), '\\.0+$', '') AS pedido_norm
         FROM ${TABLA_ORDENES}
        WHERE id = ANY($1::int[])`,
      [ids]
    );

    await client.query(
      `DELETE FROM ${TABLA_ORDENES}
        WHERE id = ANY($1::int[])`,
      [ids]
    );

    const pedidosALimpiar = rows.map(r => r.pedido_norm).filter(Boolean);
    await limpiarOcParaPedidos(client, pedidosALimpiar);
    await sincronizarPedidosOc(client);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al borrar ordenes_proveedor:', err);
    res.status(500).json({ ok: false, mensaje: 'Error al borrar' });
  } finally {
    client.release();
  }
});

router.post('/ordenes-proveedor/sincronizar', async (_req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await sincronizarPedidosOc(client);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al sincronizar OC:', err);
    res.status(500).json({ ok: false, mensaje: 'No se pudo sincronizar.' });
  } finally {
    client.release();
  }
});

module.exports = router;
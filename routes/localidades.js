const express = require('express');
const router = express.Router();
const { pool } = require('../server');

// Ruta para obtener localidades
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM localidades');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ruta para cargar localidades desde Excel
router.post('/cargar', async (req, res) => {
  try {
    const localidades = req.body;
    if (!Array.isArray(localidades) || localidades.length === 0) {
      return res.status(400).json({ ok: false, error: 'No hay datos para cargar' });
    }

    let insertados = 0;
    for (const loc of localidades) {
      // Solo inserta si ambos campos existen y no son vacíos
      const taller = (loc.taller || '').trim();
      const localidad = (loc.localidad || '').trim();
      const codigo = loc.codigo ?? null;
      const nombreCompaq = loc.nombreCompaq ?? null;
      const nomenclatura = loc.nomenclatura ?? null;

      if (!taller || !localidad) continue;
      await pool.query(
        `INSERT INTO localidades (taller, localidad, "CODIGO", "NOMBRE COMPAQ", "NOMENCLATURA")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [taller, localidad, codigo, nombreCompaq, nomenclatura]
      );
      insertados++;
    }

    res.json({ ok: true, insertados });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Ruta para editar una localidad
router.put('/editar', async (req, res) => {
  const { id, taller, localidad, codigo, nombreCompaq, nomenclatura } = req.body;
  if (!id || !taller || !localidad) {
    return res.status(400).json({ ok: false, error: 'Datos incompletos' });
  }
  try {
    await pool.query(
      `UPDATE localidades SET
         taller = $1,
         localidad = $2,
         "CODIGO" = $3,
         "NOMBRE COMPAQ" = $4,
         "NOMENCLATURA" = $5
       WHERE id = $6`,
      [taller, localidad, codigo ?? null, nombreCompaq ?? null, nomenclatura ?? null, id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Ruta para eliminar una localidad
router.delete('/eliminar', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ ok: false, error: 'ID requerido' });
  }
  try {
    await pool.query(
      'DELETE FROM localidades WHERE id = $1',
      [id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
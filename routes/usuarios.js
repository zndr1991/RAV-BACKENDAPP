const express = require('express');
const router = express.Router();
const pool = require('../server').pool;

// Crear usuario
router.post('/crear', async (req, res) => {
  const { usuario, password, rol } = req.body;
  const rolesValidos = [
    'Supervisor', 'Codificar', 'Seguimientos', 'Facturacion', 'Cancelaciones', 'Captura', 'Chofer'
  ];
  if (!usuario || !password || !rol) {
    return res.status(400).json({ ok: false, mensaje: 'Faltan datos' });
  }
  if (!rolesValidos.includes(rol)) {
    return res.status(400).json({ ok: false, mensaje: 'Rol no válido' });
  }
  try {
    await pool.query(
      'INSERT INTO usuarios (usuario, password, rol) VALUES ($1, $2, $3)',
      [usuario, password, rol]
    );
    res.json({ ok: true, mensaje: 'Usuario creado correctamente' });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      res.status(409).json({ ok: false, mensaje: 'El usuario ya existe' });
    } else {
      res.status(500).json({ ok: false, mensaje: 'Error en el servidor' });
    }
  }
});

// Listar usuarios
router.get('/listar', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, usuario, rol FROM usuarios');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error en el servidor' });
  }
});

// Editar rol de usuario
router.put('/:id/password', async (req, res) => {
  const { passwordActual, passwordNueva } = req.body;
  const { id } = req.params;

  if (!passwordActual || !passwordNueva) {
    return res.status(400).json({ ok: false, mensaje: 'Debes proporcionar la contraseña anterior y la nueva.' });
  }

  try {
    const result = await pool.query('SELECT password FROM usuarios WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }
    const passwordActualBD = result.rows[0].password;
    if (passwordActualBD !== passwordActual) {
      return res.status(401).json({ ok: false, mensaje: 'La contraseña anterior no coincide' });
    }

    await pool.query('UPDATE usuarios SET password = $1 WHERE id = $2', [passwordNueva, id]);
    res.json({ ok: true, mensaje: 'Contraseña actualizada' });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar la contraseña' });
  }
});

router.put('/:id', async (req, res) => {
  const { rol } = req.body;
  const { id } = req.params;
  const rolesValidos = [
    'Supervisor', 'Codificar', 'Seguimientos', 'Facturacion', 'Cancelaciones', 'Captura', 'Chofer'
  ];
  if (!rolesValidos.includes(rol)) {
    return res.status(400).json({ ok: false, mensaje: 'Rol no válido' });
  }
  try {
    await pool.query('UPDATE usuarios SET rol = $1 WHERE id = $2', [rol, id]);
    res.json({ ok: true, mensaje: 'Rol actualizado' });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar el usuario' });
  }
});

module.exports = router;
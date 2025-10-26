require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

const pool = require('./db');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' }
});

console.log('Iniciando backend...');

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Exporta el pool y el io para usarlo en las rutas
module.exports.pool = pool;
module.exports.io = io;
app.set('io', io);

// Rutas para excel_data
app.use('/api/excel', require('./routes/excel'));

// Si usas usuarios/login, puedes dejar estas rutas:
app.use('/api/usuarios', require('./routes/usuarios'));

app.post('/api/login', async (req, res) => {
  const usuario = req.body.usuario || req.body.username;
  const password = req.body.password || req.body.contraseña;

  try {
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE usuario = $1 AND password = $2',
      [usuario, password]
    );
    if (result.rows.length > 0) {
      res.json({ ok: true, username: usuario, role: result.rows[0].rol });
    } else {
      res.status(401).json({ ok: false, mensaje: 'Usuario o contraseña incorrectos' });
    }
  } catch (err) {
    console.error('Error en /api/login:', err);
    res.status(500).json({ ok: false, mensaje: 'Error en el servidor' });
  }
});

app.use('/api/basedatos', require('./routes/baseDatos'));

const localidadesRouter = require('./routes/localidades');
app.use('/api/localidades', localidadesRouter);

// Socket.io conexión
io.on('connection', (socket) => {
  console.log('Nuevo cliente conectado');
  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
  });
});


const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`));

// Log de errores globales
process.on('uncaughtException', (err) => {
  console.error('Excepción no capturada:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesa no manejada:', reason);
});

//# sourceMappingURL=index.js.map

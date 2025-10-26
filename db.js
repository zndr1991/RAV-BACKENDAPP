
const dns = require('dns');
const { Pool } = require('pg');
require('dotenv').config();

const lookupIPv4 = (hostname, options, callback) => {
  const lookupOptions = { ...options, family: 4, hints: dns.ADDRCONFIG };
  return dns.lookup(hostname, lookupOptions, callback);
};

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const parseConfig = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está definido en el entorno');
  }

  const url = new URL(process.env.DATABASE_URL);

  return {
    host: url.hostname,
    port: Number(url.port) || 5432,
    database: url.pathname.slice(1),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: { rejectUnauthorized: false },
    keepAlive: true,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10,
    allowExitOnIdle: true,
    lookup: lookupIPv4
  };
};

const pool = new Pool(parseConfig());

module.exports = pool;
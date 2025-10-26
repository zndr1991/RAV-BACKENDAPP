
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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  keepAlive: true,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
  allowExitOnIdle: true,
  lookup: lookupIPv4
});

module.exports = pool;
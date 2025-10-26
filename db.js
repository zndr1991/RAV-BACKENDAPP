
const dns = require('dns');
const { Pool } = require('pg');
require('dotenv').config();

// Prioritize IPv4 to avoid ENETUNREACH errors in environments without IPv6 routing
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;
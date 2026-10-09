'use strict';
const { Pool } = require('pg');
const { DATABASE_URL } = require('./config');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client', err);
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

async function getClient() {
  return pool.connect();
}

async function nextId(table) {
  const res = await query(`SELECT nextval('${table}_id_seq') AS id`);
  return parseInt(res.rows[0].id, 10);
}

module.exports = { query, getClient, nextId, pool };

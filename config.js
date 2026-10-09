'use strict';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-production';
const DATABASE_URL = process.env.DATABASE_URL || '';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = parseInt(process.env.PORT || '3000', 10);
module.exports = { SESSION_SECRET, DATABASE_URL, BASE_URL, NODE_ENV, PORT };

// db.js — picks a database backend automatically.
//
// If DATABASE_URL is set (e.g. Render's free Postgres instance), uses
// Postgres (db-postgres.js) — data survives restarts, which matters on
// Render's Free web service tier since it doesn't support persistent disks.
//
// If DATABASE_URL is not set, falls back to a local SQLite file
// (db-sqlite.js) — zero setup, good for running the app on your own laptop.
//
// Every other file (server.js) only calls the functions exported here, so
// this is the only place that needs to know which backend is active.

if (process.env.DATABASE_URL) {
  console.log('Database: Postgres (DATABASE_URL set)');
  module.exports = require('./db-postgres');
} else {
  console.log('Database: local SQLite file (no DATABASE_URL set — fine for local dev, not for Render Free tier persistence)');
  module.exports = require('./db-sqlite');
}

// db-postgres.js — Postgres backend.
// Used automatically when DATABASE_URL is set (e.g. Render's free Postgres
// instance). This is what makes data survive restarts on Render's Free web
// service tier, which doesn't support persistent disks.

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render's managed Postgres requires SSL; rejectUnauthorized:false is the
  // standard setting for Render's self-signed cert chain.
  ssl: { rejectUnauthorized: false },
});

const ready = pool.query(`
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    team_name TEXT NOT NULL,
    players TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in-progress',
    score INTEGER NOT NULL DEFAULT 0,
    total_questions INTEGER NOT NULL DEFAULT 0,
    answered_count INTEGER NOT NULL DEFAULT 0,
    start_time BIGINT,
    end_time BIGINT,
    ip TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_logins (
    id SERIAL PRIMARY KEY,
    ip TEXT,
    success INTEGER NOT NULL,
    created_at BIGINT NOT NULL
  );
`).catch(err => {
  console.error('Failed to initialize Postgres schema:', err);
  throw err;
});

async function saveTeam(record, ip) {
  await ready;
  const now = Date.now();
  await pool.query(
    `INSERT INTO teams (id, team_name, players, status, score, total_questions, answered_count, start_time, end_time, ip, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
     ON CONFLICT (id) DO UPDATE SET
       team_name=EXCLUDED.team_name,
       players=EXCLUDED.players,
       status=EXCLUDED.status,
       score=EXCLUDED.score,
       total_questions=EXCLUDED.total_questions,
       answered_count=EXCLUDED.answered_count,
       start_time=COALESCE(teams.start_time, EXCLUDED.start_time),
       end_time=EXCLUDED.end_time,
       updated_at=EXCLUDED.updated_at`,
    [
      record.id,
      record.teamName,
      JSON.stringify(record.players || []),
      record.status || 'in-progress',
      record.score || 0,
      record.totalQuestions || 0,
      record.answeredCount || 0,
      record.startTime || null,
      record.endTime || null,
      ip || null,
      now,
    ]
  );
}

async function listTeams() {
  await ready;
  const { rows } = await pool.query('SELECT * FROM teams ORDER BY updated_at DESC');
  return rows.map(rowToTeam);
}

function rowToTeam(r) {
  return {
    id: r.id,
    teamName: r.team_name,
    players: JSON.parse(r.players || '[]'),
    status: r.status,
    score: r.score,
    totalQuestions: r.total_questions,
    answeredCount: r.answered_count,
    startTime: r.start_time !== null ? Number(r.start_time) : null,
    endTime: r.end_time !== null ? Number(r.end_time) : null,
    ip: r.ip,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

async function logAdminLogin(ip, success) {
  await ready;
  await pool.query(
    'INSERT INTO admin_logins (ip, success, created_at) VALUES ($1,$2,$3)',
    [ip || null, success ? 1 : 0, Date.now()]
  );
}

async function recentFailedLogins(ip, windowMs) {
  await ready;
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int c FROM admin_logins WHERE ip = $1 AND success = 0 AND created_at > $2',
    [ip, Date.now() - windowMs]
  );
  return rows[0].c;
}

module.exports = { saveTeam, listTeams, logAdminLogin, recentFailedLogins };

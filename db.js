// db.js — SQLite data layer for Mission Astra
//
// Uses better-sqlite3 (a real, file-backed SQL database — data survives
// restarts as long as the DB file's disk is persistent). If you'd rather
// point this at Postgres/MySQL later, swap the calls in here for your
// driver of choice — every other file talks to this module, not to SQLite
// directly, so that's the only file you'd need to touch.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'mission-astra.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  team_name TEXT NOT NULL,
  players TEXT NOT NULL,           -- JSON array of player names
  status TEXT NOT NULL DEFAULT 'in-progress',
  score INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  answered_count INTEGER NOT NULL DEFAULT 0,
  start_time INTEGER,
  end_time INTEGER,
  ip TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_logins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT,
  success INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
`);

// ---------------- teams ----------------
const upsertTeamStmt = db.prepare(`
  INSERT INTO teams (id, team_name, players, status, score, total_questions, answered_count, start_time, end_time, ip, created_at, updated_at)
  VALUES (@id, @teamName, @players, @status, @score, @totalQuestions, @answeredCount, @startTime, @endTime, @ip, @now, @now)
  ON CONFLICT(id) DO UPDATE SET
    team_name=excluded.team_name,
    players=excluded.players,
    status=excluded.status,
    score=excluded.score,
    total_questions=excluded.total_questions,
    answered_count=excluded.answered_count,
    start_time=COALESCE(teams.start_time, excluded.start_time),
    end_time=excluded.end_time,
    updated_at=excluded.updated_at
`);

function saveTeam(record, ip) {
  upsertTeamStmt.run({
    id: record.id,
    teamName: record.teamName,
    players: JSON.stringify(record.players || []),
    status: record.status || 'in-progress',
    score: record.score || 0,
    totalQuestions: record.totalQuestions || 0,
    answeredCount: record.answeredCount || 0,
    startTime: record.startTime || null,
    endTime: record.endTime || null,
    ip: ip || null,
    now: Date.now(),
  });
}

function listTeams() {
  const rows = db.prepare('SELECT * FROM teams ORDER BY updated_at DESC').all();
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
    startTime: r.start_time,
    endTime: r.end_time,
    ip: r.ip,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------------- admin login attempts ----------------
const insertLoginStmt = db.prepare(`INSERT INTO admin_logins (ip, success, created_at) VALUES (?, ?, ?)`);
function logAdminLogin(ip, success) {
  insertLoginStmt.run(ip || null, success ? 1 : 0, Date.now());
}
function recentFailedLogins(ip, windowMs) {
  return db.prepare(
    'SELECT COUNT(*) c FROM admin_logins WHERE ip = ? AND success = 0 AND created_at > ?'
  ).get(ip, Date.now() - windowMs).c;
}

module.exports = {
  saveTeam,
  listTeams,
  logAdminLogin,
  recentFailedLogins,
};

// server.js — Mission Astra backend
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const QRCode = require('qrcode');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ASTRA-CMD-2026';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
// If set (e.g. your Render/Railway URL), the QR code always encodes this
// instead of guessing from the request. Recommended for public deployments.
const PUBLIC_URL = process.env.PUBLIC_URL || '';

app.set('trust proxy', 1); // so req.ip is correct behind Render/Railway/any reverse proxy
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 8, // 8 hour admin session
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && !!process.env.FORCE_HTTPS,
  },
}));

function getIp(req) {
  return (req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || '').split(',')[0].trim();
}

app.use(express.static(path.join(__dirname, 'public')));

// ---------------- QR code (generated server-side — no external CDN needed) ----------------
function siteUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL.replace(/\/$/, '');
  const host = req.headers.host; // includes port
  return `${req.protocol}://${host}`;
}

app.get('/api/qr', async (req, res) => {
  try {
    const url = siteUrl(req);
    const png = await QRCode.toBuffer(url, {
      width: 400,
      margin: 1,
      color: { dark: '#050810', light: '#ffffff' },
    });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(png);
  } catch (e) {
    console.error('QR generation failed', e);
    res.status(500).json({ error: 'qr_failed' });
  }
});

app.get('/api/site-url', (req, res) => {
  res.json({ url: siteUrl(req) });
});

// ---------------- team save/load (players + scores) ----------------
app.post('/api/teams', async (req, res) => {
  const r = req.body || {};
  if (!r.id || !r.teamName) return res.status(400).json({ error: 'id and teamName required' });
  try {
    await db.saveTeam(r, getIp(req));
    res.json({ ok: true });
  } catch (e) {
    console.error('saveTeam failed', e);
    res.status(500).json({ error: 'save_failed' });
  }
});

// ---------------- admin auth ----------------
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

app.post('/api/admin/login', async (req, res) => {
  try {
    const ip = getIp(req);
    const attempts = await db.recentFailedLogins(ip, LOGIN_WINDOW_MS);
    if (attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    const { password } = req.body || {};
    const ok = typeof password === 'string' && password === ADMIN_PASSWORD;
    await db.logAdminLogin(ip, ok);
    if (!ok) return res.status(401).json({ error: 'Incorrect access code.' });
    req.session.isAdmin = true;
    res.json({ ok: true });
  } catch (e) {
    console.error('admin login failed', e);
    res.status(500).json({ error: 'login_failed' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/session', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

// ---------------- admin data: teams ----------------
app.get('/api/admin/teams', requireAdmin, async (req, res) => {
  try {
    res.json({ teams: await db.listTeams() });
  } catch (e) {
    console.error('listTeams failed', e);
    res.status(500).json({ error: 'load_failed' });
  }
});

// SPA fallback (Express 5 syntax)
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const lanIps = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) lanIps.push(net.address);
    }
  }
  console.log(`\nMission Astra running on port ${PORT}`);
  console.log(`  Local:   http://localhost:${PORT}`);
  lanIps.forEach(ip => console.log(`  Network: http://${ip}:${PORT}`));
  if (PUBLIC_URL) console.log(`  Public:  ${PUBLIC_URL}`);
  console.log(`\nAdmin dashboard password: ${ADMIN_PASSWORD === 'ASTRA-CMD-2026' ? '(default — set ADMIN_PASSWORD in .env before your event!)' : '(set via .env)'}\n`);
});

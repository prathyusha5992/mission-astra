# Mission ASTRA

Aeronautics & Aerospace Club, GCET — event web app. Teams register, play through
8 mission stages, and an admin dashboard tracks live scores plus who's visiting
the site.

## What changed from the original single-file version

- **Real backend + database.** The game used to store data with `window.storage`,
  which only exists inside Claude.ai's Artifact preview — it did nothing when
  opened as a plain HTML file. There's now a small Node/Express server
  (`server.js`) backed by a SQLite file database (`db.js`), so team data
  actually persists.
- **Anyone can join via link or QR.** Since it's a real server now, any device
  on the same network (or the internet, once deployed) can open the URL or
  scan the QR code — it's no longer tied to the Claude.ai preview.
- **QR code fixed.** The old QR relied on a CDN script (`qrcode.min.js`) that
  could fail to load (blocked network, offline venue Wi-Fi, ad blockers,
  etc.), silently breaking the QR box. The QR is now generated **server-side**
  (`/api/qr`) and sent to the browser as a plain PNG image — nothing to load
  from a third party, and it always encodes the correct URL for wherever
  you're running it (localhost, your LAN IP, or your deployed domain).
- **Real admin authentication.** The admin password used to be a plaintext
  JavaScript variable, visible to anyone who viewed the page source — so it
  wasn't actually restricting access. The password now lives only in a
  server-side `.env` file and is checked in the backend; the browser gets a
  session cookie after a correct login, and failed attempts are rate-limited.

## Project structure

```
mission-astra/
├── server.js        Express server: routes, admin auth, visit logging, QR
├── db.js             SQLite schema + all data access (swap this file if you
│                     want Postgres/MySQL instead — see below)
├── package.json
├── .env.example      copy to .env and fill in
├── public/
│   └── index.html    the game itself (unchanged game logic/design)
└── data/
    └── mission-astra.db   created automatically on first run
```

## Run it locally

```bash
npm install
cp .env.example .env
```

Open `.env` and set a real `ADMIN_PASSWORD` and `SESSION_SECRET` (the file
has a one-line command to generate a good secret). Then:

```bash
npm start
```

The console prints the URLs to use:

```
Local:   http://localhost:3000
Network: http://192.168.x.x:3000
```

- Open the **Local** URL yourself.
- Anyone on the same Wi-Fi can open the **Network** URL, or scan the QR code
  from the home screen ("Show join QR") — it's generated from whichever URL
  the request came in on, so it'll show your LAN address automatically.

## Admin dashboard

Click **Admin dashboard** on the home screen and enter the password from
your `.env`. You'll see the live leaderboard — every registered team, crew
names, live score, status, elapsed time, and the IP they joined from. It
auto-refreshes every 5 seconds. The session lasts 8 hours or until you click
"Exit dashboard."

## Deploying with a public URL (Render, Railway, etc.)

1. Push this folder to a GitHub repo.
2. Create a new **Web Service** on Render/Railway pointing at that repo.
   - Build command: `npm install`
   - Start command: `npm start`
3. Set environment variables in the host's dashboard (same names as
   `.env.example`): `ADMIN_PASSWORD`, `SESSION_SECRET`, `FORCE_HTTPS=1`, and
   **`PUBLIC_URL`** set to the URL the host gives you (e.g.
   `https://mission-astra.onrender.com`) — this makes the QR code always
   encode that address instead of guessing.
4. **Persistent storage matters.** SQLite writes to `data/mission-astra.db`
   on disk. Most free hosting tiers use an *ephemeral* filesystem — it gets
   wiped on every redeploy or restart, which would erase all team data. On
   Render, add a **persistent disk** mounted at `/opt/render/project/src/data`
   (or wherever your working directory lands) in the service settings; on
   Railway, add a **volume** mounted at `/app/data`. Without this, the app
   still works, but data resets whenever the service restarts.

## Swapping in Postgres/MySQL later

Every route in `server.js` calls into `db.js` (`saveTeam`, `listTeams`,
`logAdminLogin`, `recentFailedLogins`) rather than touching SQLite directly. To move to a
hosted database, rewrite those functions in `db.js` using your driver of
choice (e.g. `pg` for Postgres) and keep the same function names/return
shapes — nothing in `server.js` or the frontend needs to change.

## Security notes for event day

- Change `ADMIN_PASSWORD` in `.env` before the event — don't leave the
  default.
- The admin login is rate-limited to 8 attempts per 10 minutes per IP.
- Team IDs are random and unguessable, but the `/api/teams` save endpoint
  itself isn't authenticated (by design — every participant's browser needs
  to call it to save their own progress). Only the *read* endpoints
  (`/api/admin/*`) require the admin password.

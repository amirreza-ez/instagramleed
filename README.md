# EAZAZI LEAD INSTAGRAM

Instagram lead-generation CRM for Iranian businesses — Persian RTL web app + Windows desktop app sharing one backend.
Built for **موبایل اعزازی** (mobile phones & accessories wholesale), multi-tenant SaaS-ready.

## Quick start (Windows, no Docker needed)

Requirements: **Node.js 22+** and **pnpm** (`npm i -g pnpm`).

```bash
pnpm run setup
```
Installs packages, creates `.env` with random secrets, starts a bundled PostgreSQL 18, runs migrations and seeds demo data.

```bash
pnpm dev
```
Starts database + API + web. Open **http://localhost:5173**

Default login: `admin@eazazi.ir` / `Eazazi@12345` (platform super-admin and owner of «موبایل اعزازی»). **Change the password** in Settings → حساب من.

| URL | |
|---|---|
| http://localhost:5173 | Web app (dev) |
| http://localhost:4000/api/docs | OpenAPI / Swagger UI |
| http://localhost:4000/api/health | Health check |

### Production on one machine
```bash
pnpm start
```
Builds everything; API serves the web app on http://localhost:4000. Set `NODE_ENV=production`, real `APP_URL`/`API_URL` (https) in `.env`, and put a reverse proxy with TLS (Caddy/Nginx) in front.

### Docker (Linux server)
```bash
cp .env.example .env
docker compose up -d --build
```
Set `PG_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY` (32+ chars each) and `SEED_ADMIN_PASSWORD` in `.env` first.

## Windows desktop app
```bash
pnpm desktop:dist
```
Produces `apps/desktop/release/EAZAZI-LEAD-Setup-1.0.0.exe` (NSIS installer: choose folder, desktop + Start-menu shortcuts, uninstaller).
On first launch, set the server address on the login screen (default `http://localhost:4000`). Add `app://eazazi` to the server's `CORS_ORIGINS`.
In regions where GitHub downloads are slow, set `ELECTRON_MIRROR=https://cdn.npmmirror.com/binaries/electron/` before installing.

## Commands
| Command | Purpose |
|---|---|
| `pnpm db` | Run only the bundled PostgreSQL |
| `pnpm test` | API integration tests (needs `pnpm db` running) + web unit tests |
| `pnpm -C apps/web e2e` | Browser UI test (needs `pnpm dev` running, uses Microsoft Edge) |
| `pnpm db:backup` | Backup to `backups/` (pg_dump if installed, otherwise JSON snapshot) |
| `node scripts/restore.mjs backups/<file>.json.gz --yes` | Restore a JSON snapshot (replaces all data) |

## Instagram / Meta
Works only through official Meta APIs. See [docs/META_SETUP.md](docs/META_SETUP.md) for creating the Meta app, permissions and webhooks.

## Documentation
- [docs/REFERENCE_VIDEO_ANALYSIS.md](docs/REFERENCE_VIDEO_ANALYSIS.md) — analysis of the reference product
- [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md)
- [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md)
- [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md)
- [docs/FINAL_DELIVERY_REPORT.md](docs/FINAL_DELIVERY_REPORT.md) — what is implemented, tested, and remaining limitations

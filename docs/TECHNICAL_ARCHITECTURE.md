# Technical Architecture

```
apps/
  api/      NestJS 11 + Prisma 6 + PostgreSQL — REST /api, OpenAPI at /api/docs, serves web build in production
  web/      Vite + React 19 + TypeScript + Tailwind 4 SPA (HashRouter) — shared UI for web and desktop
  desktop/  Electron shell loading the same web build over app:// protocol, NSIS installer via electron-builder
scripts/    dev orchestrator (embedded PostgreSQL), backup
docker/     Dockerfile + docker-compose (postgres + app) for servers
```

## Decisions (and deviations from the preferred stack)
| Topic | Choice | Reason |
|---|---|---|
| Frontend | Vite SPA instead of Next.js | The app is fully authenticated (no SSR/SEO value) and must be bundled into the desktop app; a static SPA is shared 1:1 by both clients. Next.js static export would add constraints without benefit. |
| Components | Own Tailwind component set (shadcn-style) | Full control over RTL & Persian design, no CLI-generated sprawl. |
| Desktop | Electron instead of Tauri | Tauri on Windows needs Rust + MSVC Build Tools (multi-GB, admin install) which are not on the build machine; Electron builds and packages with Node only, so the installer is actually built and verified here. Same shared frontend, no duplicated backend. |
| Queue | In-process job runner backed by `ImportJob` table instead of Redis/BullMQ | One fewer service to install/operate. Jobs persist state/progress in Postgres, resumable status, cancel support. Swap-in point documented for BullMQ/pg-boss when scaling horizontally. |
| Database (dev) | `embedded-postgres` (real PostgreSQL 18 binaries) | No Docker on the dev machine; zero manual install. Production uses any PostgreSQL ≥14 (docker-compose provided). |
| Validation | zod | Single schema per endpoint, typed. |
| Passwords | Node `crypto.scrypt` | No native build step on Windows. |

## Backend modules
`auth` (login/register/refresh/logout, JWT guard, roles guard, org context) · `organizations` (profile, members, categories) · `leads` (CRUD, search/filter, duplicates/merge, activities, privacy export/erase) · `imports` (upload, mapping, validation, dedupe, jobs, export) · `segments` (saved filters) · `campaigns` · `tasks` · `dashboard` · `meta` (OAuth, token crypto/refresh, webhooks, Lead Ads, comments/DM sync, Business Discovery jobs, logs) · `billing` (plans, subscription, limits, invoices, payment providers) · `admin` (super-admin tenants/system) · `audit`.

## Multi-tenancy
Every tenant table has `organizationId`. The JWT carries `{sub, org, role}`; services receive `ctx.orgId` from the guard and every Prisma query includes it in `where`. Cross-org access returns 404. Covered by e2e isolation tests.

## Auth flow
Access JWT (15 min) in memory → `Authorization: Bearer`. Refresh token (30 days, random 256-bit, stored as SHA-256 hash, rotated on use, reuse ⇒ family revoked). Web: httpOnly SameSite=Strict cookie. Desktop: returned in body, stored with Electron `safeStorage` (DPAPI).

## Meta integration
Graph version configurable (`META_GRAPH_VERSION`). Instagram Login (comments, DMs, profile) and Facebook Login (Pages, Lead Ads, IG Business Discovery). Tokens encrypted with AES-256-GCM (`ENCRYPTION_KEY`). Webhook `GET /api/webhooks/meta` handshake, `POST` verifies `X-Hub-Signature-256` HMAC with app secret, events stored idempotently then processed into leads.

## Desktop
Electron main registers `app://` privileged scheme serving the web build; preload exposes a minimal `desktop` bridge (server URL, secure token store, notifications, version). Context isolation on, node integration off, sandbox on. electron-updater with generic feed (`UPDATE_URL`).

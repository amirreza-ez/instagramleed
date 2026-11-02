# Implementation Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Reference video analysis | done |
| 2 | Environment & technology research (no Docker/Rust/Postgres on dev box → embedded PostgreSQL, Electron) | done |
| 3 | Prisma schema, migrations, NestJS skeleton | see FINAL_DELIVERY_REPORT |
| 4 | Auth, refresh rotation, RBAC, org isolation | 〃 |
| 5 | Persian RTL UI shell, design system, dashboard | 〃 |
| 6 | Leads CRM, activities, manual entry, duplicates | 〃 |
| 7 | CSV/XLSX import/export, filters, segments | 〃 |
| 8 | Campaigns, tasks/reminders | 〃 |
| 9 | Meta: OAuth, webhooks, Lead Ads, comments/DMs, Business Discovery jobs | 〃 |
| 10 | Plans, subscriptions, invoices, payments, admin panels | 〃 |
| 11 | Electron desktop + NSIS installer | 〃 |
| 12 | Vitest unit + API e2e tests, Playwright UI tests, security review | 〃 |
| 13 | Production build, Dockerfile, docker-compose, deployment docs | 〃 |

Future: WhatsApp Cloud API channel, pg-boss/Redis queue when horizontal scaling is needed, ad-spend sync from Marketing API, Telegram notifications.

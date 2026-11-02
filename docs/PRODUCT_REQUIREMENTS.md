# EAZAZI LEAD INSTAGRAM — Product Requirements

Instagram-centred lead generation and CRM for Iranian SMBs (first customer: **موبایل اعزازی**, mobile phones & accessories wholesale). Multi-tenant SaaS, Persian RTL, web + Windows desktop.
Reference analysis: `REFERENCE_VIDEO_ANALYSIS.md`. Guiding rule: only official, authorised data sources.

## Personas
- **Owner/Admin** — configures organisation, users, integrations, plan.
- **Sales manager** — campaigns, segments, assignment, reports.
- **Sales agent** — works assigned leads and follow-up tasks.
- **Platform super-admin** — manages tenants, plans, system health.

## Modules (MVP = all ✔ below)
| # | Module | Requirements |
|---|---|---|
| A | Dashboard | Total / today / 7-day / 30-day leads, qualified, converted, active campaigns, duplicate records, conversion rate, leads-per-day chart, source & status breakdown, recent activity |
| B | Instagram integration | OAuth (Instagram Login & Facebook Login), granted scopes, status, token expiry + refresh, manual sync, webhook receiver with signature check, integration logs |
| C | Lead acquisition | Meta Lead Ads (webhook + fetch), Instagram comments/DMs/mentions on own account, Business Discovery lookup jobs (reference "extraction" replacement), CSV/XLSX import, manual entry, public webhook endpoint per organisation, job history, progress, error reports, duplicate detection |
| D | CRM | Lead profile: full name, business name, Instagram username, phone, email, city, category, source, campaign, notes, tags, status, priority, assignee, score, consent, activity timeline |
| E | Smart filtering | Search + filters (status, source, city, category, campaign, assignee, tag, date range, duplicates), saved filters, segments with live counts |
| F | Campaigns | CRUD, channel, budget, dates, status; per-campaign leads, qualified, won, conversion rate, cost per lead |
| G | Sales | Tasks/reminders with due date, priority, assignee; overdue view; desktop/browser notifications; assignment |
| H | Import/export | CSV & XLSX, column auto-mapping + manual mapping, validation (phone/email/username), duplicate strategy (skip / merge / create), import report, export of filtered records to CSV/XLSX |
| I | Admin | Organisation profile, users & roles (OWNER, ADMIN, MANAGER, AGENT, VIEWER), editable business categories, audit log, super-admin tenant list, plans, system monitoring |
| J | SaaS | 14-day free trial, plans with limits (leads, users, integrations, monthly imports), usage meter, upgrade/downgrade, expiry enforcement, invoices, payment provider abstraction (Manual + Zarinpal) |

## Default organisation profile
Name «موبایل اعزازی», business type "Mobile Phones & Accessories Wholesale". Default categories (editable): عمده‌فروش موبایل، فروشگاه موبایل، فروشگاه لوازم جانبی، همکار تجاری، مشتری بالقوه، مشتری فعال.

## Non-functional
- Full Persian RTL, Vazirmatn font, Persian digits, Jalali dates; navy/white premium design; responsive (≥360 px).
- Security: hashed passwords (scrypt), short-lived JWT + rotating refresh tokens, RBAC on server, organisation isolation on every query, zod validation, rate limits, helmet headers, AES-256-GCM token encryption, HMAC webhook verification, audit log, safe uploads (size/type limits, memory only), backups.
- Privacy: consent flag & source per lead, lead data export and erasure.

## Out of scope (by design)
Scraping third-party accounts' followers/commenters, automated logins to Instagram accounts, unsolicited bulk DMs, CAPTCHA/limit evasion.

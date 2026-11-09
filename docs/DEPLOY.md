# Deploy & development workflow

## Daily development (no rebuilds)
`pnpm dev` → http://localhost:5173 — code changes appear instantly (hot reload). No Windows build needed.

## Share a public HTTPS link from this PC (no account)
1. `pnpm start` (production mode, API + web on :4000)
2. In a second terminal: `pnpm share` → prints `https://xxxx.lhr.life` (changes each run; free tunnel by localhost.run)

## Permanent free hosting: Neon (database) + Render (app)
1. **Neon** — neon.tech → sign up → New project (region: Frankfurt) → copy the *pooled* connection string.
2. **GitHub** — push this repo to a private repository.
3. **Render** — render.com → New → Blueprint → select the repo (uses `render.yaml`). Fill:
   - `DATABASE_URL` = Neon string
   - `SEED_ADMIN_PASSWORD` = your admin password
   - `APP_URL` and `API_URL` = `https://eazazi-lead.onrender.com` (your Render URL)
4. Open the Render URL and log in. Migrations and seed run automatically on every start.

Free-tier notes: Render free sleeps after 15 min idle (first request takes ~30–50 s). Neon free: 0.5 GB storage. For no sleeping, use Render Starter ($7/mo) or any VPS with `docker compose up -d`.

## Windows installer — only when a version is final
`pnpm desktop:dist`, then set the server address on the login screen to the Render URL.

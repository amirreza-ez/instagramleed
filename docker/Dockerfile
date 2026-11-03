# Production image: builds API + web, API serves the web app on one port.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @eazazi/api --filter @eazazi/web
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm -C apps/api exec prisma generate && pnpm -C apps/api build && pnpm -C apps/web build

FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable && apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production EMBEDDED_PG=false PORT=4000
COPY --from=build /app /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "cd apps/api && pnpm exec prisma migrate deploy && pnpm exec tsx prisma/seed.ts && node dist/main.js"]

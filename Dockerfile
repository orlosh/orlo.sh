# syntax=docker/dockerfile:1.7
# Build multi-stage:
#   deps      → instala las dependencias desde el lockfile (capa cacheada)
#   build     → next build (salida standalone)
#   migrator  → jobs puntuales: migraciones, seed, creación del admin (no es el runtime)
#   runner    → imagen de runtime mínima, sin root, solo con el servidor standalone

ARG NODE_VERSION=22.23.2

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG APP_VERSION=dev
# Valores de relleno para poder importar los módulos durante `next build`. Todas
# las páginas se renderizan en tiempo de petición, así que aquí nada se conecta a
# una base de datos, y estos valores nunca llegan a la etapa runner.
RUN BUILD_STANDALONE=true \
    DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-never-used-at-runtime \
    APP_VERSION=${APP_VERSION} \
    pnpm build

FROM base AS migrator
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json drizzle.config.ts ./
COPY db ./db
COPY scripts ./scripts
COPY lib/architecture.ts ./lib/architecture.ts
COPY lib/content/types.ts ./lib/content/types.ts
COPY lib/validation/content.ts ./lib/validation/content.ts
USER node
CMD ["node_modules/.bin/tsx", "scripts/migrate.ts"]

FROM node:${NODE_VERSION}-alpine AS runner
ARG APP_VERSION=dev
# Actualizar los paquetes del sistema y eliminar los gestores de paquetes: el runtime solo
# necesita `node`. Menos binarios = menor superficie de ataque y menos CVE que vigilar.
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 APP_VERSION=${APP_VERSION}
WORKDIR /app
LABEL org.opencontainers.image.version="${APP_VERSION}"
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# La única ruta con escritura en runtime (montada como tmpfs en compose).
RUN mkdir -p .next/cache && chown node:node .next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health > /dev/null || exit 1
CMD ["node", "server.js"]

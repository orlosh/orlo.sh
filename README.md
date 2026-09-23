# orlo.sh: a full-stack application, not a static page

**orlo.sh**: an engineering portfolio built as a real system: a public site whose content lives in PostgreSQL,
an authenticated admin panel that edits it, a read-only JSON API, a CI/CD pipeline with security
gates that deploys to Vercel + Neon, and observability.

New to the codebase? Start with the internal guide: [`docs/onboarding.md`](docs/onboarding.md) (Spanish).

The site explains itself at [`/engineering`](app/(site)/engineering/page.tsx). That page is rendered
from the same code it describes, including the live `/health` result and the exact
Content-Security-Policy sent with the response.

```
BUILD ─── Next.js 16 · React 19 Server Components · TypeScript · Tailwind CSS 4
DEPLOY ── GitHub Actions → Vercel (prebuilt) · Neon PostgreSQL · Docker for local dev and E2E
OBSERVE ─ pino JSON logs · /health · post-deploy smoke test · append-only audit log
SECURE ── nonce CSP · Better Auth · least-privilege DB roles · Zod · pnpm audit · gitleaks
```

---

## Architecture

```
                         INTERNET
                            │
                            ▼
                ┌───────────────────────┐
                │ Vercel Edge (fra1)    │  TLS, CDN, firewall (rate limit on /api)
                └───────────┬───────────┘
                            ▼
                ┌───────────────────────┐
                │ Next.js on Vercel     │  Functions: SSR pages, /admin (Server Actions),
                │                       │  /api/v1 (GET), /health
                │  proxy.ts → CSP nonce │
                │  data cache (tags,    │  shared across instances,
                │   keyed by version)   │  invalidated by updateTag()
                └───────────┬───────────┘
                            │ pooled connection, TLS
                            ▼
                ┌───────────────────────┐
                │ Neon PostgreSQL       │  portfolio_owner (DDL, migrations from CI)
                │                       │  portfolio_app (DML only, runtime)
                └───────────────────────┘
```

### Why Next.js and not Astro

| Requirement | Astro + separate backend | Next.js (chosen) |
|---|---|---|
| Admin panel, auth, CRUD | Needs a second service (API) with its own deploy and attack surface | Server Actions + Route Handlers in the same process |
| Content edited at runtime | SSR everywhere, or rebuilds triggered by webhooks | Tag-based cache invalidation per entity |
| SEO / performance | Excellent | Excellent with Server Components: public pages hydrate one tiny component |
| Operation | Two services | One project on Vercel |

Astro wins for purely static content. This site is not static.

### Rendering and caching strategy

1. **Read**: pages call `lib/content` (`getProjects()`, `getProject(slug)`, …). Each call wraps a
   Drizzle query in the Next.js data cache, tagged by entity (`content:projects`, …).
2. **Render**: pages render per request (the CSP nonce is per request), but PostgreSQL is only
   queried when the tag has been invalidated. A one-hour revalidate is a safety net for writes made
   outside the app.
3. **Write**: an admin Server Action checks the role, validates with Zod, writes inside a
   transaction together with an `audit_log` row, then calls `updateTag()` for every tag that the
   change can affect (a technology rename invalidates stack, projects and experience;
   [`lib/content/tags.ts`](lib/content/tags.ts)).
4. **Result**: the next request sees the change. No rebuilds, no manual file edits.

The build version (commit SHA) is part of every cache key: Vercel's data cache survives deploys,
and a new deploy must never read entries shaped by the previous version's DTOs.

Consequence of rendering at request time: the database is not needed to build (`next build`
never queries it).

---

## Project structure

```
app/
  (site)/              public pages: home, projects/[slug], notes/[slug], stack, experience, engineering
  admin/(auth)/login   login (Better Auth client)
  admin/(panel)/       protected CRUD: profile, experience, projects, stack, notes, education
  api/v1/              read-only JSON API
  api/auth/[...all]    Better Auth handler
  health/              liveness + readiness
components/
  content/             Markdown (no raw HTML), Diagram (SVG from data), cards, pills
  admin/               forms (useActionState), field errors, Markdown preview
db/
  schema.ts            tables, enums, FKs, indexes, CHECK constraints
  relations.ts         relational query config
  migrations/          SQL migrations (drizzle-kit) + custom SQL
  seed/                content schema, example content, seed script (real content is git-ignored)
lib/
  content/             public read side (repository + cached wrappers + DTO types)
  admin/               write side (mutations + Server Actions + admin queries)
  auth/                Better Auth config, authorization guard
  security/            CSP, rate limiter, client IP
  validation/          Zod schemas shared by forms, actions and API
  architecture.ts      this system's diagram, pipeline and controls (rendered on /engineering)
proxy.ts               per-request CSP nonce + optimistic /admin gate
vercel.json            region, git auto-deploys disabled (CI deploys)
instrumentation.ts     structured logging of unhandled request errors
db/neon/roles.sql      role bootstrap for Neon (production)
docker/postgres/       role and database bootstrap (local, CI)
scripts/smoke.ts       read-only post-deploy checks
docs/                  deployment (Vercel + Neon), API, onboarding, self-hosting alternative
tests/                 unit · integration (real PostgreSQL) · e2e (Playwright + axe)
```

---

## Running locally

Requirements: Node 22 (`.nvmrc`), pnpm 10 (`corepack enable`), Docker.

```sh
cp .env.example .env            # then replace every change-me value (openssl rand -hex 24)
```

**Full stack in containers** (the same build used by the E2E job):

```sh
docker compose up --build       # db → migrations + seed → app on http://localhost:3000
                                # (db/seed/ is mounted read-only so the private content file is used)
docker compose run --rm -e ADMIN_EMAIL=you@example.com migrate \
  node_modules/.bin/tsx scripts/create-admin.ts        # prompts for a password (≥ 12 chars)
```

**Development with hot reload:**

```sh
docker compose up -d db         # PostgreSQL on 127.0.0.1:5432 (also creates portfolio_test)
pnpm install
pnpm db:migrate                 # migrations with the owner role
pnpm db:seed                    # content.local.json (or the example), only if the DB is empty (--reset to wipe)
ADMIN_EMAIL=you@example.com pnpm admin:create
pnpm dev                        # http://localhost:3000 · admin at /admin
```

### Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `POSTGRES_PASSWORD` | db container | Superuser, bootstrap only |
| `DB_OWNER_PASSWORD` | db, migrations | `portfolio_owner`: owns the schema, runs DDL |
| `DB_APP_PASSWORD` | db, app | `portfolio_app`: SELECT/INSERT/UPDATE/DELETE only |
| `DATABASE_URL` | app, seed, admin CLI | Runtime connection (app role; Neon: pooled URL) |
| `DATABASE_POOL_MAX` | app | Connections per instance (default 5; 3 on Vercel) |
| `DATABASE_PREPARE` | app | Named prepared statements (default `true`) |
| `MIGRATION_DATABASE_URL` | migrations, drizzle-kit | Owner connection |
| `APP_URL` | app | Public origin: canonical URLs, sitemap, auth origin check, `Secure` cookies when https |
| `BETTER_AUTH_SECRET` | app | ≥ 32 chars, signs session cookies |
| `TRUSTED_IP_HEADER` | app | Header holding the client IP, set only when a trusted layer writes it (`x-real-ip` on Vercel). Empty = trust none |
| `LOG_LEVEL` | app | pino level (default `info`) |
| `TEST_DATABASE_URL`, `TEST_MIGRATION_DATABASE_URL` | integration tests | Same roles, `<db>_test` database |

Server variables are validated with Zod at startup ([`lib/env.ts`](lib/env.ts)); a missing
secret fails fast. `.env` is git-ignored; only `.env.example` is committed. Production values
live in Vercel and in GitHub environment secrets ([`docs/deployment.md`](docs/deployment.md)).

---

## Database

Normalised relational model ([`db/schema.ts`](db/schema.ts)):

```
profile (singleton) ─ social_links
technology_categories 1─n technologies n─m projects        (project_technologies)
                                      n─m experiences      (experience_technologies)
experiences 1─n experience_highlights
projects 1─n project_images
notes n─m tags                                             (note_tags)
education · languages
audit_log n─1 user            user 1─n session · account   (Better Auth)
rate_limit                                                 (login throttling)
```

The database enforces the invariants on its own, even if the application is bypassed: slug format,
https-only URLs, `end_date >= start_date`, `published ⇒ published_at IS NOT NULL`, a singleton
profile, case-insensitive unique technology names, and `ON DELETE RESTRICT` for layers that still
have technologies. The integration tests insert invalid rows directly to prove it.

```sh
pnpm db:generate   # new migration from schema changes (review the SQL before committing)
pnpm db:migrate    # apply (owner role)
pnpm db:studio     # browse
```

---

## Security

| Area | Control | Where |
|---|---|---|
| XSS | CSP `script-src 'self' 'nonce-…' 'strict-dynamic'`, new nonce per response, no `unsafe-inline` for scripts. Markdown rendered with raw HTML dropped and unsafe URLs stripped | `proxy.ts`, `lib/security/csp.ts`, `components/content/Markdown.tsx` |
| Headers | `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy, COOP/CORP, HSTS; no `X-Powered-By` | `next.config.ts`, `lib/security/csp.ts` |
| Authentication | Better Auth, scrypt hashes, sign-up disabled, admin created only via CLI, 8 h sessions stored server-side (revocable), `HttpOnly` + `SameSite=Lax` + `Secure` cookies | `lib/auth/index.ts`, `scripts/create-admin.ts` |
| Authorization | `role = 'admin'` checked on the server in the admin layout and again in every Server Action; the proxy redirect is only a fast path | `lib/auth/guard.ts` |
| CSRF | Server Actions: POST only, Origin must match Host. Better Auth: `trustedOrigins`. SameSite cookies | framework + `lib/auth/index.ts` |
| Brute force | 5 sign-in attempts / 5 min / IP, counters in PostgreSQL; generic error messages (no account enumeration). API: 60 req/min/IP per instance, plus a Vercel firewall rule for volume | `lib/auth/index.ts`, `lib/security/rate-limit.ts` |
| Injection | Parameterised queries only (Drizzle / postgres.js); Zod on every boundary | `lib/content/repository.ts`, `lib/validation/content.ts` |
| Least privilege | Runtime role cannot run DDL, and cannot `UPDATE`/`DELETE`/`TRUNCATE` the audit log | `db/neon/roles.sql`, `docker/postgres/10-roles.sh`, `db/migrations/0001_*.sql` |
| Deployment | Built in CI and uploaded prebuilt; git auto-deploys disabled, so production only runs code that passed the pipeline. Post-deploy smoke test checks version, headers and API | `.github/workflows/ci.yml`, `vercel.json`, `scripts/smoke.ts` |
| Supply chain | Frozen lockfile, `pnpm audit` (high+), gitleaks on full history, Dependabot | `.github/` |
| Secrets | Vercel environment variables and GitHub environment secrets, validated at startup; `.vercelignore` keeps private content out of uploads | `lib/env.ts`, `.vercelignore` |

**Known trade-offs, stated on purpose:**
- `style-src 'unsafe-inline'`: React and Next.js emit style attributes that nonces cannot cover.
  CSS injection is far less dangerous than script injection, and no user HTML is rendered.
- The API rate limiter lives in memory: on Vercel each function instance counts on its own, so it is
  best-effort; volume protection is the edge firewall rule. The login limiter is persisted in PostgreSQL.
- Platform dependency: TLS, CDN and the firewall are Vercel configuration, not code in this repo, and
  Hobby-plan logs have short retention.
- `pnpm audit` reports one moderate advisory (GHSA-67mh-4wv8-2f99, `esbuild` dev server) reached
  only through `drizzle-kit`, a development CLI that is not part of the deployed application.

---

## Testing

```sh
pnpm test                 # unit + integration (needs `docker compose up -d db`)
pnpm vitest run --project unit
pnpm test:e2e             # against a running app (pnpm dev or docker compose up)
```

| Layer | What it proves |
|---|---|
| Unit (Vitest) | Validation rules (https-only URLs, slugs, date order, diagram integrity), CSP builder, rate limiter, proxy trust, **authorization guard** (anonymous and non-admin are denied) |
| Integration (Vitest + real PostgreSQL) | Public read side only returns published/visible rows; mutations replace relations correctly; notes keep their first publication date; every mutation writes an audit entry; **the runtime role cannot alter the schema or the audit log**; SQL in parameters is inert; DB constraints hold without the app |
| E2E (Playwright + axe) | Every public page on desktop and mobile: WCAG 2.1 AA with no violations, no horizontal scroll, no console/CSP errors. Security headers and nonce rotation. API envelope and status codes. Admin: redirects, disabled sign-up, cross-origin rejection, **create note → visible on the public site → delete → 404**, raw HTML in Markdown not rendered, logout |

Tests exist where a regression would matter (auth, authorization, data integrity, the publish flow),
not to raise a coverage number.

---

## CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml):

```
push / PR
  ├─ quality      eslint (0 warnings) · tsc · unit tests
  ├─ integration  PostgreSQL service, same role model as production, migrations, tests
  └─ security     pnpm audit --audit-level=high · gitleaks (full history)
        ▼
  e2e             ephemeral stack: docker compose up --build --wait → create admin → Playwright + axe
        ▼  (main only, environment "production")
  deploy          migrations on Neon (owner role) → vercel pull/build (in CI) → vercel deploy --prebuilt
                  → pnpm smoke: /health must report this commit's SHA; headers, API, /admin redirect
```

E2E never runs against production (the admin flow writes data); production only gets the read-only
smoke test. Setup, rollback and backups: [`docs/deployment.md`](docs/deployment.md).

---

## Observability

- **Logs**: pino JSON on stdout (service, version, level, ISO time), credentials and cookies
  redacted; Vercel collects them as runtime logs (short retention on Hobby).
- **Errors**: `instrumentation.ts` logs every unhandled server error with its digest, which is
  the same reference the error page shows the visitor.
- **Health**: `GET /health` checks PostgreSQL with a 2 s timeout and returns `200 ok` or
  `503 degraded` with latency, version and uptime. Consumers: the post-deploy smoke test, an
  external uptime monitor and the site header itself.
- **Audit**: every admin change (who, what, which fields, from which IP) in `audit_log`, visible on
  the admin dashboard.

No metrics stack is deployed: on serverless there is no process to scrape and no Prometheus to scrape
it, so a `/metrics` endpoint would be decoration. Adding one becomes worthwhile together with a real scraper.

---

## API

Read-only, public, versioned: `GET /api/v1/{profile,experience,projects,projects/:slug,skills,notes,notes/:slug,education}`.
Consistent `{ data }` / `{ error: { code, message } }` envelope, validated parameters, rate limited.
Reference: [`docs/api.md`](docs/api.md).

---

## Content and privacy

The public identity is the brand **orlo.sh**. The site and this repository never contain the
owner's name, handles, employers or location:

- **Real content is never committed.** `db/seed/content.local.json` is git-ignored and excluded
  from Docker images and Vercel uploads (`.dockerignore`, `.vercelignore`); the repository ships `db/seed/content.example.json`
  with placeholders. The seed script uses `$SEED_FILE`, then the local file, then the example.
- **Employers are private by default.** `experiences.company` and `experiences.client` are
  admin-only columns; the public read side and the API only ever return `public_company`, which
  is empty unless the owner fills it in `/admin`. An integration test asserts that private
  names never appear in the public DTOs.
- The profile has a `display_name` (the brand), not a person's name.

After the first seed, all content is edited from `/admin`; no code change is required.

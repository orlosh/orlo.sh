# Onboarding · orlo.sh

Guía para quien continúa el proyecto. Léela entera una vez; después úsala como mapa.
El [README](../README.md) es el escaparate público del proyecto; este documento es el manual interno.

---

## 1. Qué es, en una frase

Un portfolio profesional construido como una aplicación real: el contenido vive en PostgreSQL,
se edita desde un panel `/admin` autenticado y se publica al instante, con CI/CD, despliegue en
Vercel + Neon, seguridad y observabilidad de verdad. **El propio sitio es la demostración técnica**:
`/engineering` describe la arquitectura con datos en vivo de la respuesta que estás leyendo.

### Tres reglas que no se negocian

1. **Identidad: la marca es `orlo.sh`.** Nunca aparece en el sitio ni en el repositorio nada que
   identifique al dueño: nombre, handles, email, ciudad, empresas ni clientes. El contenido real
   está en un fichero ignorado por git (ver §5.4) y las empresas son privadas por defecto (§8.4).
2. **Paleta: los tokens de Tailwind originales, en claro.** `primary #0df259`,
   `background-light #f5f8f6`, `background-dark #0a0a0a`, `carbon #121212`,
   `border-dark #28392e`, más `slate`, `white` y `red-500` de Tailwind. **Ningún otro tono.**
   Fondo claro por defecto; lo oscuro es un recurso puntual, no el tema (§9).
3. **Realismo.** Nada inventado: ni métricas, ni experiencia, ni paneles que parezcan vivos sin
   serlo. Todo lo que el sitio afirma sobre sí mismo tiene que ser verificable en el código.

---

## 2. Arquitectura en un vistazo

```
                 Internet
                    │ HTTPS
                    ▼
            ┌───────────────┐
            │ Vercel Edge   │  TLS, CDN, firewall (rate limit de /api)
            └───────┬───────┘
                    ▼
   ┌──────────────────────────────────────────┐
   │ Next.js 16 en Vercel (funciones)          │
   │                                          │
   │  proxy.ts ── nonce CSP + gate de /admin  │
   │                                          │
   │  páginas públicas (SSR) ─┐               │
   │  /api/v1 (GET) ──────────┼─► lib/content ─► caché de datos (etiquetas, por versión)
   │  /admin (Server Actions) ─► lib/admin ────► updateTag()          │
   │  /health ─────────────────► select 1                             │
   └───────────────────┬──────────────────────┘
                       │ conexión con pooler, TLS
                       ▼
            ┌───────────────────┐
            │ Neon PostgreSQL   │  portfolio_owner → DDL (migraciones, desde CI)
            │                   │  portfolio_app → solo DML (runtime)
            └───────────────────┘
```

No hay microservicios ni servidores propios: un proyecto de Vercel y una base de datos gestionada.
Docker y Compose siguen en el repo, pero solo para desarrollo local y para los E2E de CI. Cada
pieza que se añada tiene que responder a *qué problema resuelve*.

### 2.1 El recorrido de una lectura (visitante abre `/projects/portfolio`)

1. **`proxy.ts`** genera un nonce aleatorio y lo mete en la cabecera `Content-Security-Policy`
   (Next aplica ese nonce a sus propios `<script>`).
2. **`app/(site)/projects/[slug]/page.tsx`** valida el slug con Zod y llama a `getProject(slug)`.
3. **`lib/content/index.ts`**: `getProject` es un `unstable_cache` con la etiqueta
   `content:projects`. Si la entrada está vigente, **no se toca PostgreSQL**.
4. Si no lo está, **`lib/content/repository.ts`** ejecuta la consulta Drizzle y devuelve un
   **DTO** (`lib/content/types.ts`), nunca filas crudas.
5. La página se renderiza en servidor (Server Components) y se envía con la CSP.

### 2.2 El recorrido de una escritura (admin guarda un proyecto)

1. El formulario (`components/admin/ActionForm.tsx`) llama a la Server Action `saveProject`
   (`lib/admin/actions.ts`).
2. `run()` hace, en este orden: **autorización** (`requireAdminAction`) → **validación**
   (`projectInput`, Zod) → **mutación** (`lib/admin/mutations.ts`, en transacción junto con su fila
   de `audit_log`) → **invalidación** (`updateTag` de cada etiqueta de `INVALIDATES.project`).
3. La siguiente petición a cualquier página que dependa de proyectos lee datos frescos.
   Sin rebuilds.

### 2.3 Por qué SSR por petición y no SSG

- La CSP con nonce exige que cada respuesta se genere en ese momento.
- El contenido cambia desde `/admin` en cualquier momento.
- El coste real es bajo: la caché de datos evita ir a la base de datos en casi todas las peticiones.
- Consecuencia útil: **`next build` no necesita base de datos**, ni en CI ni en Docker.

---

## 3. Primer día

Requisitos: Node 22 (`.nvmrc`), pnpm 10 (`corepack enable`), Docker.

```sh
cp .env.example .env              # sustituye cada change-me (openssl rand -hex 24)
docker compose up -d db           # PostgreSQL en 127.0.0.1:5432 + base portfolio_test
pnpm install
pnpm db:migrate                   # migraciones con el rol owner
pnpm db:seed                      # contenido inicial (§5.4); solo si la BD está vacía
ADMIN_EMAIL=tu@ejemplo.test pnpm admin:create   # pide contraseña (≥ 12) sin eco
pnpm dev                          # http://localhost:3000 · /admin
```

Comprueba que todo está sano:

```sh
curl -s localhost:3000/health     # {"status":"ok",...}
pnpm lint && pnpm typecheck && pnpm test   # unit + integración (necesita la BD)
pnpm test:e2e                     # contra la app en marcha (ver §10)
```

Alternativa con el build de contenedor (el mismo que usan los E2E de CI): `docker compose up --build` (BD → migraciones + seed →
app en :3000). **No uses a la vez `pnpm dev` y el contenedor `app`: ambos usan el puerto 3000.**

---

## 4. Mapa del código

| Ruta | Responsabilidad | La tocas cuando… |
|---|---|---|
| `app/(site)/` | Páginas públicas + `layout.tsx` (header, footer, metadata) | cambias una página pública |
| `app/admin/(auth)/login` | Login (cliente de Better Auth) | cambias el acceso |
| `app/admin/(panel)/` | CRUD del panel. Su `layout.tsx` es la frontera de autorización | añades o cambias un editor |
| `app/api/v1/` | API JSON de solo lectura | expones datos nuevos |
| `app/health/route.ts` | Liveness + readiness | añades una dependencia crítica |
| `app/sitemap.ts`, `robots.ts`, `opengraph-image.tsx`, `notes/rss.xml` | SEO | añades rutas indexables |
| `components/content/` | Piezas del sitio público (diagrama, timeline, stack, markdown…) | cambias el diseño |
| `components/site/` | Header, footer, wordmark, contenedor | cambias la estructura común |
| `components/admin/` | Formularios, campos con errores, borrado con confirmación | cambias el panel |
| `db/schema.ts`, `db/relations.ts` | Modelo de datos | cambias el modelo |
| `db/migrations/` | SQL generado + SQL propio | **nunca a mano salvo migraciones `--custom`** |
| `db/seed/` | Esquema del contenido inicial, ejemplo, script de seed | cambias el seed |
| `db/neon/roles.sql` | Creación del rol de la app en Neon (se ejecuta una vez) | cambias el modelo de roles |
| `lib/content/` | Lectura pública: repositorio, caché, etiquetas, DTOs | añades datos públicos |
| `lib/admin/` | Escritura: mutaciones, Server Actions, consultas del admin | añades o cambias una edición |
| `lib/auth/` | Configuración de Better Auth y guard de autorización | cambias auth |
| `lib/security/` | CSP, rate limiter, IP de cliente | cambias cabeceras o límites |
| `lib/validation/content.ts` | Esquemas Zod compartidos (formularios, acciones, API) | cambias reglas de datos |
| `lib/architecture.ts` | Diagrama, pipeline, controles y hechos **de este sistema** | cambias la arquitectura (§9.3) |
| `lib/env.ts`, `lib/logger.ts`, `lib/health.ts` | Entorno validado, logs JSON, health | — |
| `proxy.ts`, `instrumentation.ts` | Nonce CSP + gate de `/admin`; log de errores no controlados | — |
| `scripts/` | `migrate.ts`, `create-admin.ts`, `smoke.ts` (comprobación tras desplegar) | — |
| `vercel.json`, `.vercelignore` | Región, despliegue desde git desactivado, qué no se sube nunca | cambias la plataforma |
| `docker/`, `Dockerfile`, `compose.yaml` | Stack local y de E2E | cambias el entorno local o de CI |
| `docs/self-hosting/` | Alternativa con VPS (Caddy + Compose), fuera de uso | nunca, salvo que se abandone Vercel |
| `.github/` | CI/CD y Dependabot | cambias el pipeline |
| `tests/` | `unit/`, `integration/`, `e2e/` | siempre |

---

## 5. Datos

### 5.1 Modelo

```
profile (fila única, id = 1) ─ social_links
technology_categories 1─n technologies n─m projects      (project_technologies)
                                      n─m experiences    (experience_technologies)
experiences 1─n experience_highlights
projects 1─n project_images
notes n─m tags                                           (note_tags)
education · languages
audit_log n─1 user            user 1─n session · account (Better Auth)
rate_limit                                               (throttling del login)
```

La base de datos defiende sus invariantes sola, aunque la aplicación falle: formato de slug,
URLs solo `https://`, `end_date >= start_date`, `published ⇒ published_at`, perfil único, nombres de
tecnología únicos sin distinguir mayúsculas, y no se puede borrar una capa que tenga tecnologías.
Zod repite las mismas reglas para dar errores legibles en el formulario.

### 5.2 Dos roles

- `portfolio_owner` es dueño del esquema y ejecuta las migraciones (`MIGRATION_DATABASE_URL`).
- `portfolio_app` es el rol de la aplicación: solo `SELECT/INSERT/UPDATE/DELETE` (`DATABASE_URL`).
  No puede crear ni borrar tablas, y **no puede modificar ni borrar `audit_log`**
  (migración `0001`). Los tests de integración lo comprueban.

En local y en CI los crea `docker/postgres/10-roles.sh` (`portfolio_owner` + `portfolio_app`).
En Neon el propietario es el rol `<base>_owner` (aquí `portfolio_owner`) y `db/neon/roles.sql`
crea `portfolio_app` con los mismos
permisos. El nombre del rol de la app coincide en todos los entornos porque la migración `0001` lo
referencia.

### 5.3 Cambiar el esquema

```sh
# 1. edita db/schema.ts
pnpm db:generate --name describe_el_cambio   # genera db/migrations/NNNN_*.sql
# 2. LEE el SQL generado; es lo que se ejecutará en producción
pnpm db:migrate
```

- SQL que Drizzle no sabe generar (permisos, datos): `pnpm exec drizzle-kit generate --custom --name x`.
- Las migraciones son **solo hacia delante y aditivas** (columnas nuevas nullable o con default).
  Así el rollback de la aplicación (§11) funciona con el esquema nuevo. Para renombrar o borrar una
  columna: primero se añade la nueva, se despliega, se migra el uso y se borra en un despliegue posterior.
- Las migraciones `0000`/`0001` se regeneraron antes del primer despliegue. A partir de que haya
  producción, **nunca edites una migración aplicada**: crea una nueva.

### 5.4 Contenido inicial y privacidad

- `db/seed/content.ts`: esquema Zod del fichero de contenido.
- `db/seed/content.example.json`: marcadores de ejemplo, **el único que está en git**.
- `db/seed/content.local.json`: el contenido real. Lo ignoran `.gitignore` y `.dockerignore`.
- El seed usa `$SEED_FILE` → `content.local.json` → `content.example.json`, y **solo inserta si
  la BD está vacía** (`--reset` borra el contenido; está prohibido en producción).
- En Compose, `db/seed/` se monta en solo lectura en el job `migrate`; en producción el fichero se
  copia al servidor solo para el primer seed (ver `docs/deployment.md`).

Tras el primer seed, **la base de datos es la fuente de verdad**: todo se edita desde `/admin`.

---

## 6. Lectura pública y caché

- `lib/content/repository.ts`: funciones puras que reciben `db` y devuelven DTOs. Solo devuelven
  lo publicado o visible. Son las que se prueban en integración.
- `lib/content/index.ts`: envuelve cada función en `unstable_cache` con su etiqueta y un revalidate
  de 1 h, que es solo una red de seguridad. **La versión del build (SHA) va en la clave**: en Vercel
  la caché de datos es compartida entre instancias y sobrevive a los despliegues, así que sin la
  versión un despliegue podría leer DTOs con la forma de la versión anterior.
- `lib/content/tags.ts`: `TAGS` (una etiqueta por entidad) e `INVALIDATES` (qué etiquetas
  invalida cambiar cada entidad; por ejemplo, renombrar una tecnología afecta a stack, proyectos y
  experiencia).

**Regla:** si añades una lectura, dale una etiqueta. Si añades una escritura, añade su entrada en
`INVALIDATES`. Si te olvidas, el cambio no aparece hasta una hora después y parecerá un bug aleatorio.

Los DTOs solo usan strings, números y booleanos (fechas en ISO): `unstable_cache` serializa a JSON,
así que un `Date` volvería convertido en string.

---

## 7. Escritura y panel de administración

Todas las Server Actions pasan por `run()` en `lib/admin/actions.ts`:

```
requireAdminAction()  →  schema.safeParse()  →  mutación + audit_log (transacción)  →  updateTag()
```

- Las Server Actions son endpoints públicos aunque solo las use `/admin`: **cada una comprueba
  el rol**. El layout del panel protege las páginas, pero eso no protege las acciones.
- Las entidades de una sola tabla (enlaces, capas, tecnologías, formación, idiomas) comparten
  `saveSimple`/`deleteSimpleAction`, con el discriminador `entity`. Si añades una de ese tipo, basta
  con registrarla en `SIMPLE_TABLES` (mutations) y en `SIMPLE` (actions).
- Los errores de PostgreSQL (duplicado, FK, CHECK) se traducen a mensajes para el editor en
  `describeDbError`.
- Los formularios usan `useActionState`: los errores por campo llegan por contexto a
  `components/admin/fields.tsx`.

### Receta: añadir un campo a los proyectos (ejemplo, `role`)

1. `db/schema.ts`: añade `role: text("role")` a `projects`; después `pnpm db:generate` y `pnpm db:migrate`.
2. `lib/validation/content.ts`: `projectInput` → `role: optional(120)`.
3. `lib/admin/actions.ts`: en `readProject` añade `role: text("role")`.
4. `app/admin/(panel)/projects/[id]/page.tsx`: `<TextField name="role" … defaultValue={row?.role} />`.
5. `lib/content/types.ts` y `repository.ts`: añádelo al DTO y al mapeo.
6. Píntalo en la página pública.
7. `pnpm typecheck` te señala lo que falte. Añade una aserción en `tests/integration/content.test.ts`.

`lib/admin/mutations.ts` no cambia: `projectColumns` ya propaga los campos validados.

### Receta: añadir una entidad nueva (ejemplo, laboratorios)

Tabla + relaciones → función de repositorio + getter cacheado con etiqueta nueva → entrada en
`INVALIDATES` → mutaciones (o registro como entidad simple) → Server Actions → editor en
`/admin` → página pública → sitemap → endpoint en `/api/v1` (y `docs/api.md`) → tests.

---

## 8. Autenticación y seguridad

### 8.1 Auth

- **Better Auth** (`lib/auth/index.ts`) con email y contraseña (hash scrypt). **El registro
  público está desactivado**: la única forma de tener cuenta es `pnpm admin:create`, que también
  sirve para cambiar la contraseña.
- Las sesiones se guardan en PostgreSQL (revocables borrando filas de `session`) y duran 8 h.
  Las cookies son `HttpOnly` y `SameSite=Lax`, más `Secure` cuando `APP_URL` es https.
- El login se limita a 5 intentos cada 5 minutos por IP, con los contadores en la tabla
  `rate_limit` (sobreviven a reinicios).
- Autorización: `lib/auth/guard.ts`. `requireAdminPage()` protege las páginas y
  `requireAdminAction()` las acciones. El rol se guarda en `user.role` y el cliente no puede
  escribirlo.
- `proxy.ts` solo redirige al login cuando **no hay cookie**. Es una optimización, no un control
  de seguridad.

### 8.2 Cabeceras y XSS

- CSP con nonce por petición y `'strict-dynamic'`, sin `unsafe-inline` en scripts
  (`lib/security/csp.ts`). `style-src` sí permite `'unsafe-inline'`: es un compromiso documentado.
- Resto de cabeceras, HSTS incluido, en `next.config.ts` (lista en `lib/security/csp.ts`).
- El Markdown se renderiza con `react-markdown` descartando el HTML crudo. **No uses
  `dangerouslySetInnerHTML`.**

### 8.3 IP del cliente

`TRUSTED_IP_HEADER` indica de qué cabecera se toma la IP (rate limiting, auditoría y Better Auth).
En Vercel es `x-real-ip`, que la plataforma escribe y sobrescribe. Si está vacía, no se confía en
ninguna cabecera: cualquiera podría falsificarla para saltarse los límites. En ese caso Better Auth
usa un único contador compartido, que es más estricto.

### 8.4 Frontera de privacidad

`experiences.company` y `experiences.client` son **privados** y solo se ven en `/admin`. Lo
público es `public_company`, vacío por defecto. `findExperience` nunca lee las columnas privadas.
Hay dos tests que vigilan esto: uno de integración (los DTOs no contienen nombres privados) y uno
E2E (ninguna página ni endpoint contiene los nombres del fichero privado). Si añades datos
personales al modelo, sigue el mismo patrón.

---

## 9. Frontend y diseño

### 9.1 Sistema visual

Los tokens están en `app/globals.css` y el comentario de cabecera explica el papel de cada uno. Reglas:

- Fondo `background-light`; superficies `white` con borde `border-dark/15`; títulos en `carbon`;
  texto `slate-700`/`800`; metadatos en `slate-600`. **`slate-500` o más claro no cumple el
  contraste AA** sobre el fondo (4.45:1, lo detectó axe).
- **El verde solo se usa como relleno o marcador**, con texto `carbon` encima. Como texto sobre
  fondo claro da 1.4:1. Un solo elemento verde protagonista por pantalla.
- Lo oscuro (`carbon`) se reserva para la banda de arquitectura de la home, los paneles de
  diagrama y los bloques de código. Dentro de un bloque oscuro, añade la clase `on-dark` (ajusta
  el foco y las etiquetas).
- Utilidades propias: `.label` (voz de máquina, mono y en mayúsculas), `.dot-grid`, `.mark`
  (subrayador verde), `.live-edge`, `.link`, `.chip`, `.panel`.
- Tipografías del sistema ORLO vía `next/font` (servidas desde el propio sitio, sin terceros en la
  CSP): Schibsted Grotesk, IBM Plex Mono y Newsreader para la prosa larga.

### 9.2 Componentes con datos reales

| Componente | Qué muestra | De dónde sale |
|---|---|---|
| `SiteHeader` | estado `sistemas ok · db N ms` | `healthReport()` en cada render |
| `RequestReceipt` | tiempo de datos, latencia de la BD, versión, uptime | medido durante esa petición (`lib/timing.ts`) |
| `Timeline` | experiencia a escala temporal | `getExperience()` |
| `StackLayers` | capas y tecnologías, enlazadas a proyectos | `getStack()` |
| `Diagram` / `DiagramPanel` | SVG a partir de nodos y aristas (`lane` = fila, `column` = columna) | `lib/architecture.ts` o `projects.diagram` |

**Nada puede aparentar estar en vivo si no lo está.** Si un dato no se puede medir, no se pinta.

### 9.3 `lib/architecture.ts` va de la mano del código

Ese fichero describe **este sistema** (diagrama, pipeline, controles de seguridad con el fichero
que los implementa, hechos contables) y alimenta `/engineering` y la home. No está en la BD porque
describe código. **Si cambias la arquitectura, el pipeline o un control, actualiza este fichero en
el mismo commit.** Si no, el sitio mentiría sobre sí mismo.

### 9.4 JavaScript en cliente

El sitio público solo hidrata `NavLinks` (marca la sección activa). En el panel hay formularios
interactivos. Antes de añadir `"use client"` en lo público, pregúntate si hace falta de verdad.

---

## 10. Tests

| Capa | Comando | Qué cubre | Requisito |
|---|---|---|---|
| Unit | `pnpm vitest run --project unit` | validación, CSP, rate limiter, IP de confianza, guard de autorización (con mocks), formato | nada |
| Integración | `pnpm vitest run --project integration` | repositorio y mutaciones contra PostgreSQL real, audit log, privilegios del rol, inyección, constraints, privacidad | `docker compose up -d db` |
| E2E | `pnpm test:e2e` | todas las páginas en escritorio y móvil con axe (WCAG 2.1 AA), cabeceras, API, flujo completo del admin (publicar → ver → borrar → 404), privacidad | app en marcha + admin creado |

- La integración usa la base `portfolio_test` con los mismos roles que producción y la vacía antes
  de cada test (con el rol owner, porque el de la app no puede vaciar `audit_log`).
- Credenciales E2E: `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` (por defecto `admin@example.test` /
  `local-dev-password-123`, solo en local).
- Si un E2E del login falla con 429, habrás agotado el rate limit con varias ejecuciones seguidas:
  `docker exec portfolio-db-1 psql -U postgres -d portfolio -c "delete from rate_limit"`.
- Criterio: se testea lo que dolería romper (auth, autorización, integridad, publicación,
  privacidad), no se persigue un porcentaje de cobertura.

---

## 11. CI/CD, despliegue y operación

Pipeline en `.github/workflows/ci.yml`:

```
quality (lint, typecheck, unit) ┐
integration (PostgreSQL)        ├─► e2e (stack efímero en Docker) ─► deploy (solo main, environment production)
security (pnpm audit, gitleaks) ┘                                     migraciones Neon → vercel build → deploy --prebuilt → smoke
```

- **El build se hace en CI** y se sube ya construido (`vercel deploy --prebuilt`). El despliegue
  automático desde git está desactivado en `vercel.json`: nada llega a producción sin pasar el pipeline.
- **Los E2E nunca corren contra producción**, porque el flujo del admin escribe datos. Producción
  solo recibe `pnpm smoke`, que es de solo lectura: espera a que `/health` devuelva el SHA
  desplegado y comprueba cabeceras, API y la redirección de `/admin`.
- Las migraciones se aplican **antes** del despliegue y tienen que ser aditivas (§5.3). Rollback:
  en Vercel, promover el despliegue anterior.
- El job `deploy` se salta mientras la variable `DEPLOY_ENABLED` del environment no sea `true`.
- Guía completa (Neon, Vercel, secretos, dominio, firewall, monitor, copias):
  [`docs/deployment.md`](deployment.md).

Observabilidad: logs JSON de pino, que Vercel recoge (retención corta en Hobby).
`instrumentation.ts` registra cada error no controlado con su `digest`, el mismo que ve el
visitante. `/health` devuelve 503 si cae la BD, y el `audit_log` se ve en el panel. No hay stack de
métricas; está justificado en el README.

---

## 12. Trampas conocidas

- **Next.js 16 no es el que recuerdas.** El middleware ahora es `proxy.ts`, hay APIs nuevas
  (`updateTag`) y otras renombradas. La documentación de la versión instalada está en
  `node_modules/next/dist/docs/`. `next dev` regenera `AGENTS.md`/`CLAUDE.md`; es normal.
- `updateTag` solo funciona dentro de Server Actions. En un Route Handler usa
  `revalidateTag(tag, "max")`.
- **Nunca consultes la BD en tiempo de build.** `sitemap`, `robots`, la imagen OG y el RSS llevan
  `dynamic = "force-dynamic"` por eso. Una ruta estática que lea la BD rompe `docker build`.
- El lint de React (`react-hooks/purity`) prohíbe `performance.now()` o `Date` dentro de
  componentes. Mide en un helper (`lib/timing.ts`).
- **Serverless ≠ un proceso largo.** Lo que se guarda en memoria (el rate limiter de la API, cualquier
  `Map` global) es por instancia y efímero. Lo que tenga que ser exacto va a PostgreSQL.
- **Conexiones:** en producción `DATABASE_URL` es la cadena con `-pooler` y `DATABASE_POOL_MAX` es bajo.
  Las migraciones van siempre por la conexión **directa** (sin pooler) y con el propietario.
- **`APP_URL` manda en la auth:** si no coincide con el dominio desde el que se entra, Better Auth
  rechaza el login por origen. Al cambiar de dominio, cambia `APP_URL` en Vercel **y** en la variable
  de GitHub.
- **Nada privado a Vercel:** `.vercelignore` excluye `db/seed/*.local.json` y los `.env`. No lo quites.
- **La etapa `migrator` del `Dockerfile` copia una lista explícita de ficheros.** Si el seed o los
  scripts importan un módulo nuevo, añádelo a esa lista (ya ocurrió con `lib/validation/content.ts`).
- En desarrollo, sin `TRUSTED_IP_HEADER`, Better Auth usa un único cubo de rate limit para todos los
  clientes. Es más estricto a propósito, no un fallo.
- Dos `next dev` a la vez: el segundo se va a :3001 y parece que "no arranca". Mata los procesos
  (`pkill -f "next dev"`).
- El seed no hace nada si ya hay perfil. Para regenerar el contenido local: `pnpm db:seed --reset`.

---

## 13. Estado actual y pendientes

**Hecho y verificado en local:** las 8 fases del roadmap, la adaptación a Vercel + Neon del código,
el pipeline y la documentación, los tests unitarios, de integración y E2E, y el script de roles de
Neon (probado contra un PostgreSQL que reproduce la situación de Neon).

**No verificado todavía:** el workflow de GitHub Actions no se ha ejecutado nunca en GitHub, y
Neon, Vercel, el dominio, el firewall y el monitor están pendientes de montar siguiendo
[`docs/deployment.md`](deployment.md).

**Pendiente de contenido** (todo desde `/admin`):
- El rol actual no tiene descripción ni tecnologías.
- Dos proyectos solo tienen el texto del CV, sin stack, repositorio ni arquitectura.
- Los idiomas no tienen nivel.
- No hay notas técnicas publicadas.
- No hay enlaces sociales de la marca.

**Pendiente técnico:**
- Autoría de git: los commits existentes tienen un email que identifica al dueño. Hay que fijar
  `user.name`/`user.email` con la identidad de la marca y reescribir el historial antes de hacer
  público el repositorio. Esa decisión es del dueño.
- Fijar las GitHub Actions por SHA en lugar de por versión mayor.
- Advisory moderado de `esbuild` que llega vía `drizzle-kit` (herramienta de desarrollo que no se
  despliega): revisarlo cuando `drizzle-kit` lo actualice.
- Las imágenes de proyectos son URLs; no hay subida de ficheros.
- No hay tema oscuro. Si se añade, que sea opcional y el claro siga siendo el predeterminado.
- Nada está commiteado: el árbol de trabajo tiene todo el trabajo, incluido el borrado de los
  componentes antiguos (`app/(sections)`, `components/layout`, `components/ui`).

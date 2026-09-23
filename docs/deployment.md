# Despliegue · Vercel + Neon

Producción: la aplicación Next.js en **Vercel** (región `fra1`) y PostgreSQL en **Neon**.
Nada de servidores propios. El build y las migraciones los ejecuta GitHub Actions; Vercel solo
recibe la aplicación ya construida.

```
git push main ─► CI (lint · typecheck · tests · seguridad · E2E)
                   └─► migraciones en Neon ─► vercel build ─► vercel deploy --prebuilt ─► smoke test
```

Esta guía es manual y va por bloques. Cada bloque termina con una comprobación: no pases al
siguiente hasta que se cumpla. La alternativa con VPS propio está en [`self-hosting/`](self-hosting/)
y no se usa en producción.

> Los paneles de Vercel y Neon cambian a menudo. Si un nombre de menú no coincide, busca la
> opción equivalente; lo importante son los valores.

---

## Bloque 1 · Neon

1. Crea un proyecto en Neon: **PostgreSQL 17**, región **AWS Europe (Frankfurt)**, la más cercana
   a `fra1`. Acepta la base de datos y el propietario por defecto. Neon nombra el rol
   `<base>_owner`: si la base es `portfolio`, el propietario es `portfolio_owner` (igual que en
   local); si aceptaste el nombre por defecto, serán `neondb` y `neondb_owner`. Da igual cuál
   sea: el script usa `current_database()`. Para confirmarlo:
   `select current_database(), current_user;`
2. Copia la **cadena de conexión directa** (sin `-pooler`) del propietario. A partir de ahora
   la llamaremos `NEON_OWNER_URL`. Solo sirve para migraciones y administración.
3. Crea el rol de la aplicación **ejecutando SQL, no desde el panel**. Neon concede
   `neon_superuser` a los roles creados desde el panel, la CLI o la API, y con ese rol la
   aplicación podría crear y borrar tablas: justo lo que queremos evitar. El propietario tampoco
   puede retirar esa concesión después, porque no fue él quien la hizo.

   En el **SQL Editor** de la consola de Neon (selecciona arriba la rama, la base de datos y,
   como rol, el propietario: `current_user` debe devolverlo), pega [`db/neon/roles.sql`](../db/neon/roles.sql) sustituyendo antes
   `CAMBIA_ESTA_CONTRASENA` por una contraseña larga (`openssl rand -base64 24`). También vale
   por psql:

   ```sh
   sed 's/CAMBIA_ESTA_CONTRASENA/<tu contraseña>/' db/neon/roles.sql | psql "$NEON_OWNER_URL"
   ```

   El script es idempotente: crea el rol si no existe, concede permisos sobre las tablas
   actuales y las futuras, deja `audit_log` en modo solo-inserción y **falla con instrucciones**
   si detecta que el rol conserva `neon_superuser`.

   > Si ya habías creado `portfolio_app` desde el panel, bórralo ahí (Roles → Delete) y ejecuta
   > el script: así se crea limpio. El script te lo dirá si no lo haces.

4. Construye la **cadena con pooler** para la app, a mano, porque el panel no conoce la
   contraseña de un rol creado por SQL: coge la del propietario y cambia el usuario por
   `portfolio_app:<contraseña>` y el host por su variante `-pooler`. A partir de ahora la
   llamaremos `NEON_APP_URL`. Debe terminar en `?sslmode=require`. Guarda las dos cadenas en tu
   gestor de contraseñas, nunca en el repo.

✅ **Comprobación**: la consulta final del script devuelve `superuser=false`, `miembro_de={}` y
`puede_crear_en_public=false`; y `psql "$NEON_APP_URL" -c "create table x(i int)"` falla con
*permission denied for schema public*.

---

## Bloque 3 · Datos en Neon

(El bloque 2 era la adaptación del código, ya hecha en el repo.)

```sh
# Las cadenas de Neon ya incluyen el nombre de la base, sea cual sea.
MIGRATION_DATABASE_URL="$NEON_OWNER_URL" pnpm db:migrate
DATABASE_URL="$NEON_APP_URL" pnpm db:seed                 # usa db/seed/content.local.json
# Pide la contraseña por consola, salvo que ADMIN_PASSWORD esté definida (ojo con el .env):
# para forzar la pregunta, pásala vacía → ADMIN_PASSWORD=
DATABASE_URL="$NEON_APP_URL" ADMIN_EMAIL=<tu email> ADMIN_PASSWORD= pnpm admin:create
```

Las variables que pasas en la línea de comandos tienen prioridad sobre tu `.env` local.

✅ **Comprobación**: `psql "$NEON_APP_URL" -c "delete from audit_log"` falla con
*permission denied*, y `select display_name from profile` devuelve `orlo.sh`.

---

## Bloque 4 · Vercel (primer despliegue, manual)

1. Crea una cuenta en Vercel (plan **Hobby**) y un proyecto **importando el repositorio de GitHub**.
   El despliegue automático desde git está desactivado en `vercel.json`: el proyecto existirá,
   pero no desplegará nada solo.
2. **Settings → Environment Variables**, entorno *Production*:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `NEON_APP_URL` (con pooler) |
   | `DATABASE_POOL_MAX` | `3` |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` (uno nuevo, no el de local) |
   | `APP_URL` | de momento, la URL de producción `https://<proyecto>.vercel.app` |
   | `TRUSTED_IP_HEADER` | `x-real-ip` |
   | `LOG_LEVEL` | `info` |

3. Primer despliegue desde tu máquina, igual que lo hará CI:

   ```sh
   pnpm dlx vercel@59.25.0 login
   pnpm dlx vercel@59.25.0 link                                  # crea .vercel/ (ignorado por git)
   pnpm dlx vercel@59.25.0 pull --yes --environment=production
   APP_VERSION=$(git rev-parse HEAD) pnpm dlx vercel@59.25.0 build --prod
   pnpm dlx vercel@59.25.0 deploy --prebuilt --prod
   ```

   `.vercel/.env.production.local` contiene secretos reales: no lo compartas. `.vercelignore`
   evita que se suba el contenido privado del seed.

✅ **Comprobación**: `pnpm smoke https://<proyecto>.vercel.app $(git rev-parse HEAD)` pasa, y
puedes entrar en `/admin` con el usuario del bloque 3.

---

## Bloque 5 · CI/CD

En GitHub: **Settings → Environments → New environment → `production`** (opcional: exigir tu
aprobación antes de cada despliegue).

| Tipo | Nombre | Valor |
|---|---|---|
| secret | `VERCEL_TOKEN` | token de Vercel (Account Settings → Tokens), con alcance limitado al equipo |
| secret | `VERCEL_ORG_ID` | `orgId` de `.vercel/project.json` |
| secret | `VERCEL_PROJECT_ID` | `projectId` de `.vercel/project.json` |
| secret | `NEON_MIGRATION_URL` | `NEON_OWNER_URL` (directa, rol propietario) |
| variable | `APP_URL` | la misma URL que `APP_URL` en Vercel |
| variable | `DEPLOY_ENABLED` | `true` (mientras no exista, el job de despliegue se salta) |

Qué hace el job `deploy` de [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) en cada push
a `main` que pasa todo lo anterior:

1. aplica las migraciones en Neon con el rol propietario;
2. `vercel pull` + `vercel build --prod` en el runner, con `APP_VERSION` = SHA del commit;
3. `vercel deploy --prebuilt --prod`;
4. `pnpm smoke $APP_URL <sha>`: espera a que `/health` devuelva esa versión y comprueba cabeceras,
   API y la redirección de `/admin`. Solo lectura: no escribe nada en producción.

✅ **Comprobación**: un push a `main` termina con el job `deploy` en verde, y `/health` muestra el
SHA de ese commit.

---

## Bloque 6 · Dominio `orlo.sh`

1. Vercel → proyecto → **Settings → Domains**: añade `orlo.sh` y `www.orlo.sh`, y configura `www`
   para que redirija a `orlo.sh`.
2. En tu registrador, crea los registros DNS que indique Vercel. El certificado se emite solo.
3. Cambia `APP_URL` a `https://orlo.sh` **en Vercel y en la variable de GitHub**, y despliega
   (con un push a `main` o re-ejecutando el workflow).

A partir de ese momento el login solo funciona desde `https://orlo.sh`: Better Auth rechaza otros
orígenes, y es lo esperado.

✅ **Comprobación**: `pnpm smoke https://orlo.sh`, y el login funciona en el dominio final.

---

## Bloque 7 · Rate limit en el borde

La API pública tiene un límite en memoria por instancia, que es aproximado en serverless. La
protección real contra volumen va en el firewall de Vercel. Antes de nada, comprueba qué reglas
de rate limit incluye el plan Hobby en ese momento.

Regla propuesta: si la ruta empieza por `/api/`, se cuenta por IP, **100 peticiones por minuto**;
al superarlo, se deniega.

✅ **Comprobación**:
`for i in $(seq 1 150); do curl -s -o /dev/null -w "%{http_code}\n" https://orlo.sh/api/v1; done | sort | uniq -c`
tiene que mostrar respuestas bloqueadas. Las del firewall no llevan cabeceras `x-ratelimit-*`
(las del límite de la app sí), y así sabes qué capa respondió.

---

## Bloque 8 · Observabilidad y copias

- **Disponibilidad**: un monitor externo gratuito (UptimeRobot, Better Stack…) sobre
  `https://orlo.sh/health`, que alerte si la respuesta no es 200 o no contiene `"status":"ok"`.
- **Logs**: Vercel → proyecto → Logs. En Hobby la retención es corta. El historial de cambios
  del contenido está en `audit_log`, en la base de datos.
- **Copias**: Neon permite restaurar a un momento anterior dentro de la ventana de su plan. Para
  tener una copia propia:

  ```sh
  pg_dump "$NEON_OWNER_URL" -Fc -f portfolio-$(date +%F).dump    # guárdala fuera del repo
  pg_restore -d "$NEON_OWNER_URL" --clean --no-owner portfolio-AAAA-MM-DD.dump
  ```

  No subas dumps como artefactos de GitHub Actions si el repo es público: los artefactos se
  pueden descargar.

✅ **Comprobación**: has recibido una alerta de prueba del monitor y tienes una copia restaurada al
menos una vez en una rama de Neon.

---

## Operación diaria

| Tarea | Cómo |
|---|---|
| Volver a la versión anterior | Vercel → Deployments → versión anterior → *Promote* (o `vercel rollback`). Las migraciones son aditivas, así que la versión anterior funciona con el esquema nuevo |
| Ver qué versión está en producción | `curl -s https://orlo.sh/health` → `version` |
| Revocar todas las sesiones del admin | `psql "$NEON_OWNER_URL" -c "delete from session"` |
| Cambiar la contraseña del admin | `DATABASE_URL="$NEON_APP_URL" ADMIN_EMAIL=<email> pnpm admin:create` |
| Rotar `BETTER_AUTH_SECRET` | cambiarlo en Vercel y redesplegar (cierra todas las sesiones) |
| Rotar la contraseña de `portfolio_app` | `ALTER ROLE portfolio_app PASSWORD '…'` como propietario, y actualizar `DATABASE_URL` en Vercel |
| Añadir una migración | `pnpm db:generate` en local, revisar el SQL, commit: el pipeline la aplica antes de desplegar |

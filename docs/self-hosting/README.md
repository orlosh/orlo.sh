# Self-hosting (alternativa, no se usa en producción)

Configuración para ejecutar el portfolio en un VPS propio con Docker Compose y Caddy. Fue el
despliegue original; producción está hoy en Vercel + Neon ([`../deployment.md`](../deployment.md)).

**No lo cubre CI y no se mantiene activamente.** Sirve como referencia si algún día hay que salir de
Vercel.

| Fichero | Qué es |
|---|---|
| `compose.prod.yaml` | Caddy + app + PostgreSQL con redes separadas, contenedores de solo lectura y sin capacidades Linux |
| `Caddyfile` | TLS automático, HSTS, compresión; sobrescribe `X-Forwarded-For` |
| `deploy.sh` | pull → migraciones → `up --wait` → comprobación de `/health` |

Diferencias con producción: la app lee la IP de `x-forwarded-for` (`TRUSTED_IP_HEADER`), y los roles
de PostgreSQL los crea `docker/postgres/10-roles.sh` (copiado junto a estos ficheros), no
`db/neon/roles.sql`. Las imágenes se construyen con el `Dockerfile` de la raíz.

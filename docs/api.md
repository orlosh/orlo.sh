# Public API · v1

Read-only JSON API over the same cached data layer that renders the website
(`lib/content`). It exists so the content is consumable by other clients and so
the data contract is explicit and testable, not because the site needs it: the
pages read the data layer directly, without an HTTP hop.

## Conventions

| | |
|---|---|
| Base path | `/api/v1` |
| Methods | `GET` only. Anything else → `405` |
| Success | `200` `{ "data": … }` |
| Error | `4xx/5xx` `{ "error": { "code": "not_found" \| "bad_request" \| "rate_limited" \| "internal", "message": "…" } }` |
| Rate limit | 60 req/min per client IP **per function instance** (best-effort on serverless). Headers `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`; `429` + `retry-after` when exceeded. Volume protection is a Vercel firewall rule in front of `/api/`, whose responses carry no `x-ratelimit-*` headers |
| Caching | `cache-control: public, max-age=60, stale-while-revalidate=300` on success; `no-store` on errors |
| Validation | Path parameters are validated (`slug`: `^[a-z0-9]+(-[a-z0-9]+)*$`) before reaching the cache or database → `400` |
| Visibility | Only published projects/notes and visible experience are ever returned |

Unhandled errors return a generic `500` body; the detail goes to the server log.

## Endpoints

| Endpoint | Returns |
|---|---|
| `GET /api/v1` | This index |
| `GET /api/v1/profile` | Name, headline, location, summary, public links, languages |
| `GET /api/v1/experience` | Experience, current roles first, with highlights and technologies |
| `GET /api/v1/projects` | Published projects (summary) |
| `GET /api/v1/projects/{slug}` | Case study: all sections, diagram, images, technologies |
| `GET /api/v1/skills` | Technologies grouped by layer, with the published projects that use each one |
| `GET /api/v1/notes` | Published technical notes (summary) |
| `GET /api/v1/notes/{slug}` | Note with Markdown body and reading time |
| `GET /api/v1/education` | Formal education, certifications, courses |
| `GET /health` | `200 {status:"ok"}` / `503 {status:"degraded"}` with database check and latency |

The response types are the DTOs in [`lib/content/types.ts`](../lib/content/types.ts).

## Example

```console
$ curl -s https://<domain>/api/v1/projects/portfolio | jq '.data | {title, status, technologies}'
$ curl -s -i https://<domain>/api/v1/projects/NOT_VALID
HTTP/2 400
{"error":{"code":"bad_request","message":"Invalid slug"}}
```

## Why there is no write API

Writes happen only through Server Actions in `/admin`, which require an admin
session, are CSRF-protected by Origin checks and SameSite cookies, and are
audited. A token-based write API would add a second authentication mechanism
with no current consumer.

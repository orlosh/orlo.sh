import { apiRoute } from "@/lib/api/http";

/** Autodocumentación mínima. Referencia completa: docs/api.md. */
export const GET = apiRoute(async () => ({
  version: "v1",
  description: "Read-only public API. Same data as the website, from the same cached data layer.",
  conventions: {
    success: "{ data }",
    error: "{ error: { code, message } }",
    rateLimit: "60 requests / minute / IP (x-ratelimit-* headers, 429 + retry-after)",
  },
  endpoints: [
    "GET /api/v1/profile",
    "GET /api/v1/experience",
    "GET /api/v1/projects",
    "GET /api/v1/projects/{slug}",
    "GET /api/v1/skills",
    "GET /api/v1/notes",
    "GET /api/v1/notes/{slug}",
    "GET /api/v1/education",
    "GET /health",
  ],
}));

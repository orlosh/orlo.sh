import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { clientIp } from "@/lib/security/client-ip";
import { createRateLimiter } from "@/lib/security/rate-limit";

/**
 * Convenciones de /api/v1:
 *   éxito → { data: ... }
 *   error → { error: { code, message } } con el status HTTP correspondiente
 * Datos públicos y de solo lectura, así que las respuestas se pueden cachear durante poco tiempo.
 */
export type ApiErrorCode = "not_found" | "bad_request" | "rate_limited" | "internal";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export function apiError(status: number, code: ApiErrorCode, message: string, headers?: HeadersInit) {
  return Response.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store", ...headers } });
}

/**
 * Envuelve un handler GET con rate limiting, gestión de errores y cabeceras de caché.
 * Los errores desconocidos se registran con detalle y se responden de forma genérica.
 */
export function apiRoute<C>(handler: (req: Request, ctx: C) => Promise<unknown | Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const ip = clientIp(req.headers, env().TRUSTED_IP_HEADER) ?? "unknown";
    const rl = limiter(ip);
    const rlHeaders = {
      "x-ratelimit-limit": String(rl.limit),
      "x-ratelimit-remaining": String(rl.remaining),
      "x-ratelimit-reset": String(Math.ceil(rl.resetAt / 1000)),
    };
    if (!rl.allowed) {
      return apiError(429, "rate_limited", "Too many requests", {
        ...rlHeaders,
        "retry-after": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
      });
    }
    try {
      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return Response.json(
        { data: result },
        { headers: { ...rlHeaders, "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
      );
    } catch (err) {
      logger.error({ err, path: new URL(req.url).pathname }, "api handler failed");
      return apiError(500, "internal", "Internal error", rlHeaders);
    }
  };
}

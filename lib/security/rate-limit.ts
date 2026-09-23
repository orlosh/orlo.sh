/**
 * Rate limiter de ventana fija en la memoria del proceso. Solo lo usa /api/v1.
 *
 * En Vercel es una protección aproximada ("best-effort"): cada instancia de
 * función lleva sus propios contadores y se pierden al reciclarse. La
 * protección real contra volumen está en el borde (regla del firewall de
 * Vercel); esta capa solo frena ráfagas que caen en la misma instancia, sin
 * coste ni servicios extra y sin tocar la base de datos.
 * El login no usa esto: Better Auth guarda sus contadores en PostgreSQL.
 */
export type RateLimitResult = { allowed: boolean; limit: number; remaining: number; resetAt: number };

export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function check(key: string, now = Date.now()): RateLimitResult {
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      // Memoria acotada: antes de crecer, descartar las entradas caducadas y luego las más
      // antiguas.
      if (hits.size >= maxKeys) {
        for (const [k, e] of hits) if (e.resetAt <= now) hits.delete(k);
        if (hits.size >= maxKeys) hits.delete(hits.keys().next().value as string);
      }
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    return {
      allowed: entry.count <= limit,
      limit,
      remaining: Math.max(0, limit - entry.count),
      resetAt: entry.resetAt,
    };
  };
}

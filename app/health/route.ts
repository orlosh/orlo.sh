import { healthReport } from "@/lib/health";
import { logger } from "@/lib/logger";

/**
 * Liveness + readiness en un solo endpoint, consumido por el HEALTHCHECK de Docker,
 * Caddy y el monitor de disponibilidad externo. 503 cuando una dependencia crítica está
 * caída, para que orquestadores y monitores puedan actuar solo con el código de estado.
 * Los detalles del error van a los logs, nunca a la respuesta.
 */
export async function GET() {
  const report = await healthReport();
  if (report.status !== "ok") logger.warn({ health: report }, "health check degraded");
  return Response.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}

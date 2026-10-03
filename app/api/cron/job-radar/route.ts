import { timingSafeEqual } from "node:crypto";
import { db } from "@/db/client";
import { AiError } from "@/lib/ai/gemini";
import { isDue, runRadar } from "@/lib/ai/radar";
import { aiContext, getAiSettings } from "@/lib/ai/store";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Ejecución programada del radar (Vercel Cron, vercel.json). Vercel envía
 * `Authorization: Bearer $CRON_SECRET`; sin ese secreto configurado la ruta no hace nada.
 * Si se ejecuta y la frecuencia la deciden los ajustes del panel: el cron solo despierta.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const expected = env().CRON_SECRET;
  if (!expected) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${expected}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!env().CRON_SECRET) return Response.json({ ok: false, reason: "CRON_SECRET no configurado" }, { status: 503 });
  if (!authorized(req)) return Response.json({ ok: false }, { status: 401 });

  const settings = await getAiSettings(db);
  if (!settings.enabled || !settings.radarEnabled) return Response.json({ ok: true, skipped: "radar desactivado" });
  if (!isDue(settings.radarLastRunAt, settings.radarFrequencyDays, new Date())) return Response.json({ ok: true, skipped: "aún no toca" });

  try {
    const r = await runRadar(await aiContext(db, env().BETTER_AUTH_SECRET), "cron");
    logger.info({ ...r }, "job radar run");
    return Response.json({ ok: true, ...r });
  } catch (err) {
    logger.error({ err }, "job radar failed");
    const status = err instanceof AiError ? 200 : 500;
    return Response.json({ ok: false, error: (err as Error).message }, { status });
  }
}

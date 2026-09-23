import "server-only";
import { sqlClient } from "@/db/client";

export type CheckResult = { status: "up" | "down"; latencyMs: number };

export type HealthReport = {
  status: "ok" | "degraded";
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: { database: CheckResult };
};

const DB_TIMEOUT_MS = 2000;

async function checkDatabase(): Promise<CheckResult> {
  const started = performance.now();
  try {
    await Promise.race([
      sqlClient`select 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS)),
    ]);
    return { status: "up", latencyMs: Math.round(performance.now() - started) };
  } catch {
    return { status: "down", latencyMs: Math.round(performance.now() - started) };
  }
}

export async function healthReport(): Promise<HealthReport> {
  const database = await checkDatabase();
  return {
    status: database.status === "up" ? "ok" : "degraded",
    version: process.env.APP_VERSION ?? "dev",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: { database },
  };
}

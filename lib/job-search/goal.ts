import type { jobSearchGoal } from "@/db/schema";
import { DEFAULT_GOAL, type Goal } from "./model";

type GoalRow = typeof jobSearchGoal.$inferSelect;

const list = (v: string | null) =>
  (v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** Fila de la base de datos → objetivo. Sin fila, valores por defecto con inicio hoy. */
export function goalFromRow(row: GoalRow | undefined, today: string): Goal {
  if (!row) return { ...DEFAULT_GOAL, startDate: today };
  return {
    startDate: row.startDate,
    durationDays: row.durationDays,
    timezone: row.timezone,
    targetRoles: list(row.targetRoles),
    targetSeniority: row.targetSeniority,
    minSalary: row.minSalary,
    currency: row.currency,
    preferredWorkplaces: row.preferredWorkplaces,
    preferredLocations: list(row.preferredLocations),
    extraSkills: list(row.extraSkills),
    weeklyApplicationTarget: row.weeklyApplicationTarget,
    followupApplicationDays: row.followupApplicationDays,
    followupRecruiterDays: row.followupRecruiterDays,
    followupReferralDays: row.followupReferralDays,
    staleDays: row.staleDays,
  };
}

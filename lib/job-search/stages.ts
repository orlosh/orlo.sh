import { OPPORTUNITY_STATUSES, type OpportunityStatus } from "./enums";

/** Estados de cierre: fuera de la progresión del proceso. */
export const CLOSED_STATUSES = ["rejected", "ghosted", "withdrawn", "archived"] as const satisfies readonly OpportunityStatus[];

/** Antes de aplicar: la oportunidad todavía se está evaluando o preparando. */
export const PRE_APPLY_STATUSES = [
  "discovered",
  "researching",
  "qualified",
  "networking",
  "referral_requested",
  "referral_received",
  "ready_to_apply",
] as const satisfies readonly OpportunityStatus[];

/** Proceso abierto con la empresa (desde la candidatura hasta la oferta). */
export const IN_PROCESS_STATUSES = [
  "applied",
  "recruiter_screen",
  "interview",
  "technical",
  "final_interview",
  "offer",
] as const satisfies readonly OpportunityStatus[];

export const INTERVIEWING_STATUSES = [
  "recruiter_screen",
  "interview",
  "technical",
  "final_interview",
] as const satisfies readonly OpportunityStatus[];

/** Entrada de la bandeja: lo pegado rápidamente y aún sin revisar. */
export const INBOX_STATUSES = ["discovered", "researching"] as const satisfies readonly OpportunityStatus[];

const has = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

export const isClosed = (s: OpportunityStatus) => has(CLOSED_STATUSES, s);
export const isActive = (s: OpportunityStatus) => !isClosed(s);
export const isPreApply = (s: OpportunityStatus) => has(PRE_APPLY_STATUSES, s);
export const isInProcess = (s: OpportunityStatus) => has(IN_PROCESS_STATUSES, s);
export const isInterviewing = (s: OpportunityStatus) => has(INTERVIEWING_STATUSES, s);

/** Posición en la progresión (0 = discovered … 12 = offer); null para los estados de cierre. */
export function rank(s: OpportunityStatus): number | null {
  if (isClosed(s)) return null;
  return OPPORTUNITY_STATUSES.indexOf(s);
}

export const RANK = {
  qualified: rank("qualified")!,
  applied: rank("applied")!,
  recruiterScreen: rank("recruiter_screen")!,
  interview: rank("interview")!,
  final: rank("final_interview")!,
  offer: rank("offer")!,
};

/** Mayor posición alcanzada a lo largo del historial (los cierres no cuentan). */
export function maxRank(statuses: Iterable<OpportunityStatus>): number {
  let max = -1;
  for (const s of statuses) {
    const r = rank(s);
    if (r !== null && r > max) max = r;
  }
  return max;
}

/** Grupos de fase para filtros y para el Kanban. */
export const STAGE_GROUPS = {
  pre_apply: { label: "Antes de aplicar", statuses: PRE_APPLY_STATUSES },
  applied: { label: "Aplicada", statuses: ["applied"] },
  interviewing: { label: "Entrevistando", statuses: INTERVIEWING_STATUSES },
  offer: { label: "Oferta", statuses: ["offer"] },
  closed: { label: "Cerrada", statuses: CLOSED_STATUSES },
} as const satisfies Record<string, { label: string; statuses: readonly OpportunityStatus[] }>;
export type StageGroup = keyof typeof STAGE_GROUPS;

export function stageGroup(s: OpportunityStatus): StageGroup {
  for (const [key, g] of Object.entries(STAGE_GROUPS)) {
    if ((g.statuses as readonly string[]).includes(s)) return key as StageGroup;
  }
  return "pre_apply";
}

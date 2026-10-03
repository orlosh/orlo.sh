import type {
  ActivityType,
  CompanyTier,
  ContactKind,
  ContactStatus,
  InterviewKind,
  InterviewOutcome,
  OpportunityStatus,
  Outcome,
  Priority,
  ReferralStatus,
  Seniority,
  Source,
  TaskKind,
  TaskStatus,
  Workplace,
} from "./enums";

/**
 * Instantánea plana de la búsqueda. La carga el repositorio en unas pocas consultas y la usan
 * todas las funciones de cálculo (plan diario, alertas, analytics, score), que son puras:
 * mismos datos y misma fecha → mismo resultado, y se prueban sin base de datos.
 */

export type Goal = {
  startDate: string;
  durationDays: number;
  timezone: string;
  targetRoles: string[];
  targetSeniority: Seniority | null;
  minSalary: number | null;
  currency: string | null;
  preferredWorkplaces: Workplace[];
  preferredLocations: string[];
  extraSkills: string[];
  weeklyApplicationTarget: number;
  followupApplicationDays: number;
  followupRecruiterDays: number;
  followupReferralDays: number;
  staleDays: number;
};

export const DEFAULT_GOAL: Goal = {
  startDate: "1970-01-01",
  durationDays: 30,
  timezone: "UTC",
  targetRoles: [],
  targetSeniority: null,
  minSalary: null,
  currency: null,
  preferredWorkplaces: [],
  preferredLocations: [],
  extraSkills: [],
  weeklyApplicationTarget: 10,
  followupApplicationDays: 5,
  followupRecruiterDays: 3,
  followupReferralDays: 4,
  staleDays: 7,
};

export type OppSnap = {
  id: string;
  title: string;
  companyId: string | null;
  companyName: string | null;
  companyTier: CompanyTier | null;
  companyInterest: number | null;
  url: string | null;
  description: string | null;
  status: OpportunityStatus;
  priority: Priority;
  source: Source;
  workplace: Workplace | null;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  postedAt: string | null;
  discoveredAt: string;
  appliedAt: string | null;
  deadline: string | null;
  offerDeadline: string | null;
  statusChangedAt: Date;
  nextAction: string | null;
  nextActionAt: string | null;
  nextFollowUpAt: string | null;
  firstResponseAt: Date | null;
  closedAt: Date | null;
  outcome: Outcome | null;
  lastActivityAt: Date;
  roleFit: number | null;
  seniorityFit: number | null;
  scoreOverride: number | null;
  scoreOverrideReason: string | null;
  createdAt: Date;
  /** Estado del mejor referral del proceso. */
  referral: "none" | "requested" | "received";
  /** Hay un recruiter o hiring manager vinculado. */
  hasRecruiter: boolean;
};

export type HistorySnap = { opportunityId: string; fromStatus: OpportunityStatus | null; toStatus: OpportunityStatus; changedAt: Date };

export type InterviewSnap = {
  id: string;
  opportunityId: string;
  kind: InterviewKind;
  scheduledAt: Date | null;
  outcome: InterviewOutcome;
  completedAt: Date | null;
  interviewerName: string | null;
  prepDone: number;
  prepTotal: number;
};

export type TaskSnap = {
  id: string;
  title: string;
  kind: TaskKind;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  completedAt: Date | null;
  opportunityId: string | null;
  contactId: string | null;
  interviewId: string | null;
  origin: string;
};

export type ContactSnap = {
  id: string;
  name: string;
  kind: ContactKind;
  status: ContactStatus;
  companyId: string | null;
  companyName: string | null;
  lastInteractionAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: Date;
};

export type ReferralSnap = {
  id: string;
  opportunityId: string;
  contactId: string | null;
  status: ReferralStatus;
  requestedAt: string;
  receivedAt: string | null;
};

export type ActivitySnap = {
  type: ActivityType;
  occurredAt: Date;
  opportunityId: string | null;
  contactId: string | null;
};

export type Snapshot = {
  /** "Hoy" en la zona del objetivo. */
  today: string;
  now: Date;
  goal: Goal;
  opportunities: OppSnap[];
  history: HistorySnap[];
  interviews: InterviewSnap[];
  tasks: TaskSnap[];
  contacts: ContactSnap[];
  referrals: ReferralSnap[];
  activities: ActivitySnap[];
};

export const oppLabel = (o: { title: string; companyName: string | null }) =>
  o.companyName ? `${o.companyName} · ${o.title}` : o.title;

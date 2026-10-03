import { describe, expect, it } from "vitest";
import { bottleneck, conversions, factsFor, funnel, insights, referralAnalytics, sourcePerformance, timeAnalytics, weekMetrics } from "@/lib/job-search/analytics";
import { interviewEffects, transitionEffects } from "@/lib/job-search/automations";
import { icsFile, mailto } from "@/lib/job-search/calendar";
import { addBusinessDays, dateIn, diffDays, relativeDay, utcToZonedInput, weekStart, zonedToUtc } from "@/lib/job-search/dates";
import { analyzeJobDescription, compareProfile, type CandidateProfile, matchCv } from "@/lib/job-search/jd";
import { DEFAULT_GOAL, type OppSnap, type Snapshot } from "@/lib/job-search/model";
import { alerts, dailyPlan, dashboardKpis } from "@/lib/job-search/plan";
import { computeScore } from "@/lib/job-search/score";
import { maxRank, stageGroup } from "@/lib/job-search/stages";
import { guessFromUrl } from "@/lib/job-search/url";
import { goalInput, opportunityInput, quickOpportunityInput } from "@/lib/job-search/validation";

const NOW = new Date("2026-10-07T10:00:00Z"); // miércoles
const TODAY = "2026-10-07";
const GOAL = { ...DEFAULT_GOAL, startDate: "2026-10-01" };

function opp(over: Partial<OppSnap> = {}): OppSnap {
  return {
    id: over.id ?? "o1",
    title: "Backend Engineer",
    companyId: "c1",
    companyName: "Acme",
    companyTier: null,
    companyInterest: null,
    url: null,
    description: null,
    status: "discovered",
    priority: "medium",
    source: "linkedin",
    workplace: null,
    location: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    postedAt: null,
    discoveredAt: "2026-10-01",
    appliedAt: null,
    deadline: null,
    offerDeadline: null,
    statusChangedAt: NOW,
    nextAction: null,
    nextActionAt: null,
    nextFollowUpAt: null,
    firstResponseAt: null,
    closedAt: null,
    outcome: null,
    lastActivityAt: NOW,
    roleFit: null,
    seniorityFit: null,
    scoreOverride: null,
    scoreOverrideReason: null,
    createdAt: NOW,
    referral: "none",
    hasRecruiter: false,
    ...over,
  };
}

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return { today: TODAY, now: NOW, goal: GOAL, opportunities: [], history: [], interviews: [], tasks: [], contacts: [], referrals: [], activities: [], ...over };
}

/* ------------------------------------------------------------------ fechas */

describe("dates", () => {
  it("adds business days skipping weekends", () => {
    expect(addBusinessDays("2026-10-07", 5)).toBe("2026-10-14"); // mié → mié siguiente
    expect(addBusinessDays("2026-10-09", 1)).toBe("2026-10-12"); // vie → lun
    expect(addBusinessDays("2026-10-10", 3)).toBe("2026-10-14"); // sáb → mié
  });

  it("computes the Monday of a week and relative labels", () => {
    expect(weekStart("2026-10-07")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // domingo
    expect(relativeDay("2026-10-08", TODAY)).toBe("mañana");
    expect(relativeDay("2026-10-04", TODAY)).toBe("hace 3 d");
    expect(diffDays("2026-10-01", TODAY)).toBe(6);
  });

  it("resolves 'today' in the configured time zone", () => {
    const lateUtc = new Date("2026-10-07T23:30:00Z");
    expect(dateIn(lateUtc, "UTC")).toBe("2026-10-07");
    expect(dateIn(lateUtc, "Asia/Tokyo")).toBe("2026-10-08");
    expect(dateIn(lateUtc, "Not/AZone")).toBe("2026-10-07"); // zona inválida → UTC
  });

  it("round-trips local wall time through UTC, including DST changes", () => {
    const d = zonedToUtc("2026-10-07T10:30", "America/New_York");
    expect(d?.toISOString()).toBe("2026-10-07T14:30:00.000Z");
    expect(utcToZonedInput(d, "America/New_York")).toBe("2026-10-07T10:30");
    // El domingo del cambio de hora en EE. UU. (1 nov 2026 → EST, UTC-5).
    expect(zonedToUtc("2026-11-02T09:00", "America/New_York")?.toISOString()).toBe("2026-11-02T14:00:00.000Z");
    expect(zonedToUtc("garbage", "UTC")).toBeNull();
  });
});

/* -------------------------------------------------------------- fases */

describe("stages", () => {
  it("ranks the progression and ignores closed states", () => {
    expect(maxRank(["discovered", "applied", "rejected"])).toBe(7);
    expect(stageGroup("technical")).toBe("interviewing");
    expect(stageGroup("ghosted")).toBe("closed");
  });
});

/* ------------------------------------------------------- automatizaciones */

describe("transitionEffects", () => {
  const ctx = { today: TODAY, now: NOW, goal: GOAL };
  const base = { status: "ready_to_apply" as const, appliedAt: null, firstResponseAt: null, closedAt: null, label: "Acme · Backend" };

  it("applied → sets appliedAt, logs activity and schedules a follow-up 5 business days later", () => {
    const fx = transitionEffects(base, "applied", ctx);
    expect(fx.set.appliedAt).toBe(TODAY);
    expect(fx.activities.map((a) => a.type)).toEqual(["status_changed", "applied"]);
    expect(fx.tasks).toEqual([expect.objectContaining({ kind: "follow_up", dueDate: "2026-10-14", origin: "auto:application" })]);
    expect(fx.set.nextFollowUpAt).toBe("2026-10-14");
  });

  it("referral requested → activity + follow-up after 4 business days", () => {
    const fx = transitionEffects({ ...base, status: "networking" }, "referral_requested", ctx);
    expect(fx.referral).toBe("request");
    expect(fx.tasks[0]).toMatchObject({ kind: "follow_up", dueDate: "2026-10-13", origin: "auto:referral" });
  });

  it("first company reply records the response and cancels application follow-ups", () => {
    const fx = transitionEffects({ ...base, status: "applied", appliedAt: "2026-10-02" }, "recruiter_screen", ctx);
    expect(fx.set.firstResponseAt).toEqual(NOW);
    expect(fx.cancelApplicationFollowUps).toBe(true);
    expect(fx.activities.map((a) => a.type)).toContain("reply");
  });

  it("rejected → closes pending tasks and registers the outcome", () => {
    const fx = transitionEffects({ ...base, status: "interview", appliedAt: "2026-10-01", firstResponseAt: NOW }, "rejected", ctx);
    expect(fx.closePendingTasks).toBe(true);
    expect(fx.set).toMatchObject({ outcome: "rejected", closedAt: NOW, nextFollowUpAt: null });
    expect(fx.activities.map((a) => a.type)).toEqual(["status_changed", "rejection"]);
  });

  it("offer → registers the outcome without closing the process", () => {
    const fx = transitionEffects({ ...base, status: "final_interview", appliedAt: "2026-10-01", firstResponseAt: NOW }, "offer", ctx);
    expect(fx.set.outcome).toBe("offer");
    expect(fx.set.closedAt).toBeUndefined();
    expect(fx.activities.map((a) => a.type)).toContain("offer");
  });

  it("reopening a closed process clears the previous outcome", () => {
    const fx = transitionEffects({ ...base, status: "rejected", closedAt: NOW }, "qualified", ctx);
    expect(fx.set).toMatchObject({ closedAt: null, outcome: null });
  });

  it("is a no-op when the status does not change", () => {
    expect(transitionEffects(base, "ready_to_apply", ctx).activities).toEqual([]);
  });
});

describe("interviewEffects", () => {
  it("creates prep (day before) and thank-you (day after) tasks and advances the status forward only", () => {
    const fx = interviewEffects({ kind: "technical", scheduledAt: new Date("2026-10-12T09:00:00Z") }, { status: "recruiter_screen", label: "Acme" }, { today: TODAY, goal: GOAL });
    expect(fx.tasks.map((t) => [t.kind, t.dueDate])).toEqual([
      ["prepare_interview", "2026-10-11"],
      ["send_thank_you", "2026-10-13"],
    ]);
    expect(fx.advanceTo).toBe("technical");
    const back = interviewEffects({ kind: "recruiter_screen", scheduledAt: null }, { status: "final_interview", label: "Acme" }, { today: TODAY, goal: GOAL });
    expect(back.advanceTo).toBeNull();
  });

  it("never schedules prep in the past and skips thank-you for take-homes", () => {
    const fx = interviewEffects({ kind: "take_home", scheduledAt: new Date("2026-10-07T15:00:00Z") }, { status: "applied", label: "Acme" }, { today: TODAY, goal: GOAL });
    expect(fx.tasks).toHaveLength(1);
    expect(fx.tasks[0].dueDate).toBe(TODAY);
  });
});

/* ------------------------------------------------------------ análisis JD */

const JD = `Senior Backend Engineer
Location: Remote (EU)

What you'll do:
- Design and operate APIs in Node.js and TypeScript
- Own our PostgreSQL data model and performance

Requirements:
- 5+ years of experience building backend systems
- Strong TypeScript and Node.js
- Experience with PostgreSQL and Docker
- Kubernetes in production

Nice to have:
- Terraform
- GraphQL

Salary: €60k - €75k`;

const PROFILE: CandidateProfile = {
  skills: ["TypeScript", "Node.js", "PostgreSQL", "Docker", "Next.js"],
  experiences: [
    {
      label: "Backend Developer · Foo",
      startDate: "2019-01-01",
      endDate: "2022-12-31",
      lines: ["Built REST APIs in Node.js and TypeScript serving 2M requests/day", "Organised team events"],
    },
    { label: "Engineer · Bar", startDate: "2023-01-01", endDate: null, lines: ["Migrated PostgreSQL schemas with zero downtime using Docker"] },
  ],
  projects: [{ title: "Portfolio", summary: "Next.js site on PostgreSQL", technologies: ["Next.js", "PostgreSQL", "Docker"] }],
  targetSeniority: "senior",
  targetRoles: ["Backend Engineer"],
};

describe("analyzeJobDescription", () => {
  const a = analyzeJobDescription(JD, { extraSkills: PROFILE.skills })!;

  it("extracts role, seniority, experience, salary and workplace", () => {
    expect(a.role).toBe("Senior Backend Engineer");
    expect(a.seniority).toEqual({ value: "senior", inferred: false });
    expect(a.experience.minYears).toBe(5);
    expect(a.salary).toMatchObject({ min: 60000, max: 75000, currency: "EUR" });
    expect(a.workplace).toBe("remote");
    expect(a.location).toBe("Remote (EU)");
  });

  it("separates required from preferred skills by section", () => {
    expect(a.requiredSkills).toEqual(expect.arrayContaining(["TypeScript", "Node.js", "PostgreSQL", "Docker", "Kubernetes"]));
    expect(a.preferredSkills).toEqual(expect.arrayContaining(["Terraform", "GraphQL"]));
    expect(a.requiredSkills).not.toContain("Terraform");
    expect(a.responsibilities[0]).toContain("Design and operate APIs");
    expect(a.tools).toEqual(expect.arrayContaining(["Docker", "Kubernetes"]));
  });

  it("does not mistake common words for the Go language", () => {
    const b = analyzeJobDescription("We go to great lengths for customers.\nRequirements:\n- Python and Golang experience", {})!;
    expect(b.requiredSkills).toContain("Go");
    const c = analyzeJobDescription("Requirements:\n- We go above and beyond with Python every day here", {})!;
    expect(c.requiredSkills).not.toContain("Go");
  });

  it("returns null for text too short to analyse", () => {
    expect(analyzeJobDescription("Hiring!")).toBeNull();
  });
});

describe("compareProfile / matchCv — nothing invented", () => {
  const a = analyzeJobDescription(JD, { extraSkills: PROFILE.skills })!;
  const m = compareProfile(a, PROFILE, TODAY);

  it("matches only skills with evidence and lists the rest as gaps", () => {
    expect(m.matchedSkills.map((x) => x.skill)).toEqual(expect.arrayContaining(["TypeScript", "Node.js", "PostgreSQL", "Docker"]));
    expect(m.missingRequired).toEqual(["Kubernetes"]);
    expect(m.missingPreferred).toEqual(expect.arrayContaining(["Terraform", "GraphQL"]));
    expect(m.requiredCoverage).toBeCloseTo(4 / 5);
    const ts = m.matchedSkills.find((x) => x.skill === "TypeScript")!;
    expect(ts.sources).toContain("Backend Developer · Foo");
  });

  it("recommendations never tell you to add a skill you lack", () => {
    const text = m.recommendations.join(" ");
    expect(text).toContain("No añadas Kubernetes");
    expect(m.relevantExperience[0].line).toContain("REST APIs");
  });

  it("technologies linked to an experience count as evidence but never as CV bullets", () => {
    const withTech: CandidateProfile = { ...PROFILE, experiences: [...PROFILE.experiences, { label: "Ops · Baz", startDate: "2018-01-01", endDate: "2018-12-31", lines: [], technologies: ["Kubernetes"] }] };
    const mm = compareProfile(a, withTech, TODAY);
    expect(mm.missingRequired).toEqual([]);
    expect(mm.matchedSkills.find((x) => x.skill === "Kubernetes")?.sources).toEqual(["Ops · Baz"]);
    const r = matchCv(a, "Built REST APIs in Node.js and TypeScript serving 2M requests/day", withTech);
    expect(r.keywordsToAdd).toContainEqual({ keyword: "Kubernetes", evidence: "Ops · Baz" });
  });

  it("computes merged years of experience", () => {
    expect(m.profileYears).toBeGreaterThan(7.5);
    expect(m.gaps.join(" ")).not.toContain("años;"); // cumple los 5+ años
  });

  it("CV matching only reorders and highlights existing lines", () => {
    const cv = ["Contact: someone", "Organised team events and offsites for the whole office", "Built REST APIs in Node.js and TypeScript serving 2M requests/day"].join("\n");
    const r = matchCv(a, cv, PROFILE);
    expect(r.emphasize.map((e) => e.line)).toContain("Built REST APIs in Node.js and TypeScript serving 2M requests/day");
    expect(r.irrelevant).toContain("Organised team events and offsites for the whole office");
    expect(r.move.some((x) => x.line.includes("PostgreSQL schemas"))).toBe(true); // está en el perfil, no en el CV
    expect(r.keywordsMissing).toContain("Kubernetes");
    expect(r.keywordsToAdd.map((k) => k.keyword)).toContain("PostgreSQL");
    // Toda línea sugerida existe literalmente en el CV o en el perfil.
    const known = new Set([...cv.split("\n"), ...PROFILE.experiences.flatMap((e) => e.lines)]);
    for (const line of [...r.emphasize.map((e) => e.line), ...r.improve.map((e) => e.line), ...r.move.map((e) => e.line)]) expect(known.has(line)).toBe(true);
  });
});

/* ------------------------------------------------------------------ score */

describe("computeScore", () => {
  const a = analyzeJobDescription(JD, { extraSkills: PROFILE.skills })!;
  const ctx = { goal: { ...GOAL, targetRoles: ["Backend Engineer"], targetSeniority: "senior" as const, minSalary: 70000, currency: "EUR", preferredWorkplaces: ["remote" as const] }, today: TODAY, analysis: a, match: compareProfile(a, PROFILE, TODAY), sourceRow: null, overallInterviewRate: null };

  it("sums ten explained factors to at most 100", () => {
    const s = computeScore(opp({ salaryMax: 75000, salaryCurrency: "EUR", workplace: "remote", companyTier: "a", referral: "received", postedAt: "2026-10-05" }), ctx);
    expect(s.factors).toHaveLength(10);
    expect(s.factors.reduce((n, f) => n + f.max, 0)).toBe(100);
    expect(s.factors.every((f) => f.reason.length > 0)).toBe(true);
    expect(s.computed).toBe(s.factors.reduce((n, f) => n + f.points, 0));
    expect(s.computed).toBeGreaterThan(80);
  });

  it("missing data scores half and says so", () => {
    const s = computeScore(opp(), { ...ctx, analysis: null, match: null, goal: GOAL });
    expect(s.factors.find((f) => f.key === "skills")).toMatchObject({ points: 10, reason: "Sin Job Description para analizar." });
    expect(s.factors.find((f) => f.key === "history")?.reason).toContain("Insufficient data");
  });

  it("manual override replaces the score but keeps the computed breakdown", () => {
    const s = computeScore(opp({ scoreOverride: 95, scoreOverrideReason: "Empresa soñada" }), ctx);
    expect(s).toMatchObject({ score: 95, overridden: true, overrideReason: "Empresa soñada" });
    expect(s.computed).not.toBe(95);
  });
});

/* -------------------------------------------------------------- analytics */

describe("analytics", () => {
  const t = (iso: string) => new Date(`${iso}T09:00:00Z`);
  const applied = (id: string, over: Partial<OppSnap> = {}) => opp({ id, status: "applied", appliedAt: "2026-10-01", ...over });
  const s = snap({
    opportunities: [
      applied("a", { status: "interview", firstResponseAt: t("2026-10-03"), source: "referral" }),
      applied("b", { status: "rejected", firstResponseAt: t("2026-10-05"), closedAt: t("2026-10-05") }),
      applied("c"),
      opp({ id: "d", status: "qualified" }),
      applied("e", { status: "offer", firstResponseAt: t("2026-10-02"), referral: "received" }),
    ],
    history: [
      { opportunityId: "a", fromStatus: "applied", toStatus: "recruiter_screen", changedAt: t("2026-10-03") },
      { opportunityId: "a", fromStatus: "recruiter_screen", toStatus: "interview", changedAt: t("2026-10-05") },
      { opportunityId: "e", fromStatus: "applied", toStatus: "final_interview", changedAt: t("2026-10-04") },
      { opportunityId: "e", fromStatus: "final_interview", toStatus: "offer", changedAt: t("2026-10-06") },
    ],
  });
  const facts = factsFor(s);

  it("builds the funnel from the furthest stage ever reached", () => {
    expect(funnel(facts)).toEqual({ opportunities: 5, qualified: 5, applied: 4, responses: 3, interviews: 2, finals: 1, offers: 1 });
  });

  it("computes conversions with their sample size", () => {
    const c = Object.fromEntries(conversions(facts).map((x) => [x.key, x]));
    expect(c.app_response).toMatchObject({ num: 3, den: 4, rate: 0.75 });
    expect(c.final_offer).toMatchObject({ num: 1, den: 1 });
    expect(c.referral_interview).toMatchObject({ num: 2, den: 2 });
  });

  it("splits by source and by referral", () => {
    const rows = sourcePerformance(facts);
    expect(rows.find((r) => r.source === "linkedin")).toMatchObject({ applications: 3, interviews: 1, offers: 1 });
    const ref = referralAnalytics(facts);
    expect(ref.withReferral.applications).toBe(2);
    expect(ref.withoutReferral.applications).toBe(2);
  });

  it("measures time between stages", () => {
    const time = timeAnalytics(s, facts);
    expect(time.appToResponse.n).toBe(3);
    expect(time.finalToOffer.avg).toBe(2);
  });

  it("insights and comparisons require a minimum sample", () => {
    expect(insights(s, facts).filter((i) => i.text.includes("referrals"))).toEqual([]);
  });

  it("flags volume as the bottleneck when there are few opportunities", () => {
    expect(bottleneck(snap({ opportunities: [opp()] }), factsFor(snap({ opportunities: [opp()] })))?.stage).toBe("Opportunities");
  });

  it("counts the week's activity", () => {
    const w = weekMetrics(s, "2026-09-28");
    expect(w.applications).toBe(4);
    expect(w.responses).toBe(2); // la del día 5 cae ya en la semana siguiente
    expect(w.offers).toBe(0); // la oferta llegó el 6 de octubre, en la semana siguiente
    expect(weekMetrics(s, "2026-10-05").offers).toBe(1);
  });
});

/* ------------------------------------------------- plan diario y alertas */

describe("dailyPlan / alerts / kpis", () => {
  const s = snap({
    opportunities: [
      opp({ id: "f", status: "final_interview", statusChangedAt: new Date("2026-10-01T09:00:00Z") }),
      opp({ id: "h", status: "qualified", priority: "high", lastActivityAt: new Date("2026-09-20T09:00:00Z") }),
      opp({ id: "r", status: "ready_to_apply", deadline: "2026-10-08" }),
      opp({ id: "i", status: "discovered" }),
      opp({ id: "ap", status: "applied", appliedAt: "2026-10-01" }),
    ],
    interviews: [{ id: "iv", opportunityId: "f", kind: "final", scheduledAt: new Date("2026-10-08T15:00:00Z"), outcome: "pending", completedAt: null, interviewerName: null, prepDone: 1, prepTotal: 4 }],
    tasks: [{ id: "t1", title: "Follow-up Acme", kind: "follow_up", status: "open", priority: "medium", dueDate: "2026-10-05", completedAt: null, opportunityId: "ap", contactId: null, interviewId: null, origin: "auto:application" }],
  });

  it("orders priorities: interviews, finals, overdue follow-ups, high priority, …, research", () => {
    const plan = dailyPlan(s, new Map([["h", 80], ["r", 60]]));
    const cats = plan.map((p) => p.category);
    expect(cats).toEqual([...cats].sort((a, b) => a - b));
    expect(plan[0]).toMatchObject({ key: "interview:iv", category: 0 });
    expect(plan[0].reason).toContain("mañana");
    expect(plan.find((p) => p.taskId === "t1")?.category).toBe(2);
    expect(plan.find((p) => p.key === "apply:r")?.reason).toContain("cierra mañana");
    expect(plan.at(-1)?.key).toBe("inbox");
    expect(plan.every((p) => p.reason.length > 0)).toBe(true);
  });

  it("raises alerts with severity", () => {
    const list = alerts(s);
    expect(list[0].level).toBe("critical");
    const kinds = list.map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(["Entrevista próxima", "Follow-up overdue", "Application deadline", "Oportunidad inactiva"]));
  });

  it("counts the goal day and dashboard numbers", () => {
    const k = dashboardKpis(s);
    expect(k).toMatchObject({ day: 7, remaining: 23, finals: 1, activeApplications: 2, followUpsDue: 1, tasksToday: 1 });
  });
});

/* ------------------------------------------------------- url y calendario */

describe("guessFromUrl", () => {
  it.each([
    ["https://boards.greenhouse.io/acme-corp/jobs/123", "company_website", "Acme Corp"],
    ["https://jobs.lever.co/stripe/abc", "company_website", "Stripe"],
    ["https://acme.recruitee.com/o/backend", "company_website", "Acme"],
    ["https://www.linkedin.com/jobs/view/123", "linkedin", null],
    ["https://wellfound.com/company/foo-bar/jobs/1", "wellfound", "Foo Bar"],
    ["https://www.welcometothejungle.com/es/companies/doctolib/jobs/backend-engineer_remote", "welcome_to_the_jungle", "Doctolib"],
    ["https://es.indeed.com/viewjob?jk=1", "job_board", null],
  ])("%s", (url, source, company) => {
    expect(guessFromUrl(url)).toMatchObject({ source, company });
  });
});

describe("calendar", () => {
  it("produces a valid, escaped, folded iCalendar file", () => {
    const ics = icsFile({ id: "x", title: "Final, round; 2", start: new Date("2026-10-08T15:00:00Z"), minutes: 60, description: "a\nb", location: "https://meet.example/x" }, NOW);
    expect(ics).toContain("DTSTART:20261008T150000Z");
    expect(ics).toContain("DTEND:20261008T160000Z");
    expect(ics).toContain("SUMMARY:Final\\, round\\; 2");
    expect(ics).toContain("DESCRIPTION:a\\nb");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });

  it("builds mailto links with encoded subject and body", () => {
    expect(mailto("a@b.co", "Hola y adiós", "x\ny")).toBe("mailto:a@b.co?subject=Hola%20y%20adi%C3%B3s&body=x%0Ay");
  });
});

/* ------------------------------------------------------------- validación */

describe("job search validation", () => {
  it("normalises empty fields and requires a reason to override the score", () => {
    const o = opportunityInput.parse({ title: "Dev", url: "", salaryMin: "", status: "applied" });
    expect(o).toMatchObject({ url: null, salaryMin: null, status: "applied", priority: "medium" });
    expect(opportunityInput.safeParse({ title: "Dev", scoreOverride: "90" }).success).toBe(false);
    expect(opportunityInput.safeParse({ title: "Dev", scoreOverride: "90", scoreOverrideReason: "Referral directo del CTO" }).success).toBe(true);
  });

  it.each(["http://example.com/job", "javascript:alert(1)", "ftp://x"])("rejects non-https job URL %s", (url) => {
    expect(quickOpportunityInput.safeParse({ url }).success).toBe(false);
  });

  it("needs a URL or a title for a quick add", () => {
    expect(quickOpportunityInput.safeParse({}).success).toBe(false);
    expect(quickOpportunityInput.safeParse({ title: "Algo" }).success).toBe(true);
  });

  it("rejects salary ranges upside down and unknown time zones", () => {
    expect(opportunityInput.safeParse({ title: "Dev", salaryMin: "80000", salaryMax: "50000" }).success).toBe(false);
    const g = { startDate: "2026-10-01", durationDays: "30", weeklyApplicationTarget: "10", followupApplicationDays: "5", followupRecruiterDays: "3", followupReferralDays: "4", staleDays: "7" };
    expect(goalInput.safeParse({ ...g, timezone: "Mars/Olympus" }).success).toBe(false);
    expect(goalInput.parse({ ...g, timezone: "", targetRoles: " Backend ,, Platform " })).toMatchObject({ timezone: "UTC", targetRoles: "Backend, Platform" });
  });
});

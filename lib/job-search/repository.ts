import { and, asc, desc, eq, gte, ilike, isNotNull, or, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import type { ContentDb } from "@/lib/content/repository";
import { todayIn } from "./dates";
import { goalFromRow } from "./goal";
import type { CandidateProfile } from "./jd";
import type { Snapshot } from "./model";

/**
 * Lado de lectura de Job Search. Funciones puras de un handle de base de datos (como
 * lib/content/repository.ts) para poder ejecutarlas en los tests de integración. Solo las
 * llaman páginas de /admin que ya han pasado requireAdminPage(); nada de esto se cachea.
 */

export async function getGoal(db: ContentDb, now = new Date()) {
  const [row] = await db.select().from(t.jobSearchGoal).where(eq(t.jobSearchGoal.id, 1));
  return { row: row ?? null, goal: goalFromRow(row, todayIn(row?.timezone ?? "UTC", now)) };
}

/** Prep hecho / total a partir de las líneas "[x] …" del checklist. */
export function checklistProgress(text: string | null) {
  const lines = (text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return { done: lines.filter((l) => /^\[x\]/i.test(l)).length, total: lines.length };
}

export async function loadSnapshot(db: ContentDb, now = new Date()): Promise<Snapshot> {
  const { goal } = await getGoal(db, now);
  const today = todayIn(goal.timezone, now);
  const since = new Date(now.getTime() - 120 * 86_400_000);

  const [opps, history, interviews, tasks, contacts, referrals, links, activities] = await Promise.all([
    db
      .select({ o: t.jobOpportunities, companyName: t.jobCompanies.name, companyTier: t.jobCompanies.tier, companyInterest: t.jobCompanies.interest })
      .from(t.jobOpportunities)
      .leftJoin(t.jobCompanies, eq(t.jobOpportunities.companyId, t.jobCompanies.id)),
    db.select().from(t.jobStatusHistory),
    db.select().from(t.jobInterviews),
    db.select().from(t.jobTasks),
    db
      .select({ c: t.jobContacts, companyName: t.jobCompanies.name })
      .from(t.jobContacts)
      .leftJoin(t.jobCompanies, eq(t.jobContacts.companyId, t.jobCompanies.id)),
    db.select().from(t.jobReferrals),
    db.select().from(t.jobOpportunityContacts),
    db
      .select({ type: t.jobActivities.type, occurredAt: t.jobActivities.occurredAt, opportunityId: t.jobActivities.opportunityId, contactId: t.jobActivities.contactId })
      .from(t.jobActivities)
      .where(gte(t.jobActivities.occurredAt, since)),
  ]);

  const referralBy = new Map<string, "requested" | "received">();
  for (const r of referrals) {
    if (r.status === "received") referralBy.set(r.opportunityId, "received");
    else if (r.status === "requested" && referralBy.get(r.opportunityId) !== "received") referralBy.set(r.opportunityId, "requested");
  }
  const recruiterBy = new Set(links.filter((l) => l.role === "recruiter" || l.role === "hiring_manager").map((l) => l.opportunityId));

  return {
    today,
    now,
    goal,
    opportunities: opps.map(({ o, companyName, companyTier, companyInterest }) => ({
      id: o.id,
      title: o.title,
      companyId: o.companyId,
      companyName,
      companyTier,
      companyInterest,
      url: o.url,
      description: o.description,
      status: o.status,
      priority: o.priority,
      source: o.source,
      workplace: o.workplace,
      location: o.location,
      salaryMin: o.salaryMin,
      salaryMax: o.salaryMax,
      salaryCurrency: o.salaryCurrency,
      postedAt: o.postedAt,
      discoveredAt: o.discoveredAt,
      appliedAt: o.appliedAt,
      deadline: o.deadline,
      offerDeadline: o.offerDeadline,
      statusChangedAt: o.statusChangedAt,
      nextAction: o.nextAction,
      nextActionAt: o.nextActionAt,
      nextFollowUpAt: o.nextFollowUpAt,
      firstResponseAt: o.firstResponseAt,
      closedAt: o.closedAt,
      outcome: o.outcome,
      lastActivityAt: o.lastActivityAt,
      roleFit: o.roleFit,
      seniorityFit: o.seniorityFit,
      scoreOverride: o.scoreOverride,
      scoreOverrideReason: o.scoreOverrideReason,
      createdAt: o.createdAt,
      referral: referralBy.get(o.id) ?? "none",
      hasRecruiter: recruiterBy.has(o.id),
    })),
    history: history.map((h) => ({ opportunityId: h.opportunityId, fromStatus: h.fromStatus, toStatus: h.toStatus, changedAt: h.changedAt })),
    interviews: interviews.map((i) => {
      const p = checklistProgress(i.prepChecklist);
      return {
        id: i.id,
        opportunityId: i.opportunityId,
        kind: i.kind,
        scheduledAt: i.scheduledAt,
        outcome: i.outcome,
        completedAt: i.completedAt,
        interviewerName: i.interviewerName,
        prepDone: p.done,
        prepTotal: p.total,
      };
    }),
    tasks: tasks.map((k) => ({
      id: k.id,
      title: k.title,
      kind: k.kind,
      status: k.status,
      priority: k.priority,
      dueDate: k.dueDate,
      completedAt: k.completedAt,
      opportunityId: k.opportunityId,
      contactId: k.contactId,
      interviewId: k.interviewId,
      origin: k.origin,
    })),
    contacts: contacts.map(({ c, companyName }) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      status: c.status,
      companyId: c.companyId,
      companyName,
      lastInteractionAt: c.lastInteractionAt,
      nextFollowUpAt: c.nextFollowUpAt,
      createdAt: c.createdAt,
    })),
    referrals: referrals.map((r) => ({ id: r.id, opportunityId: r.opportunityId, contactId: r.contactId, status: r.status, requestedAt: r.requestedAt, receivedAt: r.receivedAt })),
    activities,
  };
}

/**
 * Perfil real con el que se comparan las Job Descriptions: stack, experiencias con sus logros y
 * proyectos (también los no publicados: son trabajo real). Nada se inventa ni se completa.
 */
export async function loadProfile(db: ContentDb, extraSkills: string[], targetSeniority: CandidateProfile["targetSeniority"], targetRoles: string[]): Promise<CandidateProfile> {
  const [techs, experiences, projects] = await Promise.all([
    db.select({ name: t.technologies.name }).from(t.technologies),
    db.query.experiences.findMany({
      orderBy: [desc(t.experiences.startDate)],
      with: { highlights: { orderBy: [asc(t.experienceHighlights.position)] }, technologies: { with: { technology: true } } },
    }),
    db.query.projects.findMany({ with: { technologies: { with: { technology: true } } } }),
  ]);
  return {
    skills: [...new Set([...techs.map((x) => x.name), ...extraSkills])],
    experiences: experiences.map((e) => ({
      label: `${e.role} · ${e.company}`,
      startDate: e.startDate,
      endDate: e.endDate,
      lines: [
        ...e.highlights.map((h) => h.body),
        ...(e.description ?? "").split(/\r?\n/).map((l) => l.replace(/^[-*]\s+/, "").trim()).filter((l) => l.length > 20),
      ],
      technologies: e.technologies.map((x) => x.technology.name),
    })),
    projects: projects.map((p) => ({ title: p.title, summary: p.summary, technologies: p.technologies.map((x) => x.technology.name) })),
    targetSeniority,
    targetRoles,
  };
}

/* ------------------------------------------------------------- detalle */

export async function getOpportunity(db: ContentDb, id: string) {
  return db.query.jobOpportunities.findFirst({
    where: eq(t.jobOpportunities.id, id),
    with: {
      company: true,
      contacts: { with: { contact: true } },
      interviews: { orderBy: [asc(t.jobInterviews.scheduledAt)] },
      tasks: { orderBy: [asc(t.jobTasks.status), asc(t.jobTasks.dueDate)] },
      activities: { orderBy: [desc(t.jobActivities.occurredAt)], limit: 200 },
      referrals: { with: { contact: true }, orderBy: [desc(t.jobReferrals.requestedAt)] },
      documents: { with: { document: true } },
      noteEntries: { orderBy: [desc(t.jobNotes.createdAt)] },
      history: { orderBy: [asc(t.jobStatusHistory.changedAt)] },
    },
  });
}

export const listOpportunityOptions = (db: ContentDb) =>
  db
    .select({ id: t.jobOpportunities.id, title: t.jobOpportunities.title, status: t.jobOpportunities.status, companyName: t.jobCompanies.name })
    .from(t.jobOpportunities)
    .leftJoin(t.jobCompanies, eq(t.jobOpportunities.companyId, t.jobCompanies.id))
    .orderBy(desc(t.jobOpportunities.updatedAt));

export const listContactOptions = (db: ContentDb) =>
  db
    .select({ id: t.jobContacts.id, name: t.jobContacts.name, kind: t.jobContacts.kind, companyName: t.jobCompanies.name })
    .from(t.jobContacts)
    .leftJoin(t.jobCompanies, eq(t.jobContacts.companyId, t.jobCompanies.id))
    .orderBy(asc(t.jobContacts.name));

export const listCompanyNames = (db: ContentDb) =>
  db.select({ id: t.jobCompanies.id, name: t.jobCompanies.name }).from(t.jobCompanies).orderBy(asc(t.jobCompanies.name));

/* ------------------------------------------------------------- empresas */

export async function listCompanies(db: ContentDb) {
  const rows = await db.execute<{
    id: string;
    name: string;
    tier: "a" | "b" | "c" | null;
    interest: number | null;
    archived: boolean;
    next_action: string | null;
    next_action_at: string | null;
    opportunities: number;
    active_opportunities: number;
    recruiters: number;
    contacts: number;
    referrals: number;
    last_activity: Date | null;
  }>(sql`
    select c.id, c.name, c.tier, c.interest, c.archived, c.next_action, c.next_action_at::text,
      (select count(*)::int from job_opportunities o where o.company_id = c.id) as opportunities,
      (select count(*)::int from job_opportunities o where o.company_id = c.id
         and o.status not in ('rejected','ghosted','withdrawn','archived')) as active_opportunities,
      (select count(*)::int from job_contacts k where k.company_id = c.id and k.kind = 'recruiter') as recruiters,
      (select count(*)::int from job_contacts k where k.company_id = c.id) as contacts,
      (select count(*)::int from job_referrals r join job_opportunities o on o.id = r.opportunity_id
         where o.company_id = c.id) as referrals,
      greatest(
        (select max(a.occurred_at) from job_activities a where a.company_id = c.id),
        (select max(o.last_activity_at) from job_opportunities o where o.company_id = c.id)
      ) as last_activity
    from job_companies c
    order by c.archived, c.tier nulls last, c.name
  `);
  return rows.map((r) => ({ ...r, last_activity: r.last_activity ? new Date(r.last_activity) : null }));
}

export async function getCompany(db: ContentDb, id: string) {
  const company = await db.query.jobCompanies.findFirst({ where: eq(t.jobCompanies.id, id) });
  if (!company) return null;
  const [opportunities, contacts, notes] = await Promise.all([
    db.query.jobOpportunities.findMany({ where: eq(t.jobOpportunities.companyId, id), orderBy: [desc(t.jobOpportunities.updatedAt)] }),
    db.query.jobContacts.findMany({ where: eq(t.jobContacts.companyId, id), orderBy: [asc(t.jobContacts.name)] }),
    db.query.jobNotes.findMany({ where: eq(t.jobNotes.companyId, id), orderBy: [desc(t.jobNotes.createdAt)] }),
  ]);
  return { company, opportunities, contacts, notes };
}

/* ------------------------------------------------------------- contactos */

export const listContacts = (db: ContentDb) =>
  db
    .select({ c: t.jobContacts, companyName: t.jobCompanies.name })
    .from(t.jobContacts)
    .leftJoin(t.jobCompanies, eq(t.jobContacts.companyId, t.jobCompanies.id))
    .orderBy(asc(t.jobContacts.name));

export async function getContact(db: ContentDb, id: string) {
  const contact = await db.query.jobContacts.findFirst({
    where: eq(t.jobContacts.id, id),
    with: { company: true, opportunities: { with: { opportunity: { with: { company: true } } } }, referrals: { with: { opportunity: true } } },
  });
  if (!contact) return null;
  const [activities, tasks, notes] = await Promise.all([
    db.query.jobActivities.findMany({ where: eq(t.jobActivities.contactId, id), orderBy: [desc(t.jobActivities.occurredAt)], limit: 100 }),
    db.query.jobTasks.findMany({ where: eq(t.jobTasks.contactId, id), orderBy: [asc(t.jobTasks.status), asc(t.jobTasks.dueDate)] }),
    db.query.jobNotes.findMany({ where: eq(t.jobNotes.contactId, id), orderBy: [desc(t.jobNotes.createdAt)] }),
  ]);
  return { contact, activities, tasks, notes };
}

/* ------------------------------------------------------------ entrevistas */

export const listInterviews = (db: ContentDb) =>
  db
    .select({ i: t.jobInterviews, title: t.jobOpportunities.title, opportunityStatus: t.jobOpportunities.status, companyName: t.jobCompanies.name })
    .from(t.jobInterviews)
    .innerJoin(t.jobOpportunities, eq(t.jobInterviews.opportunityId, t.jobOpportunities.id))
    .leftJoin(t.jobCompanies, eq(t.jobOpportunities.companyId, t.jobCompanies.id))
    .orderBy(sql`${t.jobInterviews.scheduledAt} desc nulls first`);

export async function getInterview(db: ContentDb, id: string) {
  const interview = await db.query.jobInterviews.findFirst({
    where: eq(t.jobInterviews.id, id),
    with: { opportunity: { with: { company: true } }, interviewer: true },
  });
  if (!interview) return null;
  const [tasks, notes, stories, previous] = await Promise.all([
    db.query.jobTasks.findMany({ where: eq(t.jobTasks.interviewId, id), orderBy: [asc(t.jobTasks.dueDate)] }),
    db.query.jobNotes.findMany({ where: eq(t.jobNotes.interviewId, id), orderBy: [desc(t.jobNotes.createdAt)] }),
    db.query.jobStarStories.findMany({ orderBy: [asc(t.jobStarStories.title)] }),
    // Rondas anteriores del mismo proceso: su feedback es la mejor preparación.
    db.query.jobInterviews.findMany({
      where: and(eq(t.jobInterviews.opportunityId, interview.opportunityId), sql`${t.jobInterviews.id} <> ${id}`),
      orderBy: [asc(t.jobInterviews.scheduledAt)],
    }),
  ]);
  return { interview, tasks, notes, stories, previous };
}

export const listStarStories = (db: ContentDb) => db.query.jobStarStories.findMany({ orderBy: [asc(t.jobStarStories.title)] });

/* ----------------------------------------------------------------- tareas */

export const listTasks = (db: ContentDb) =>
  db
    .select({
      task: t.jobTasks,
      opportunityTitle: t.jobOpportunities.title,
      companyName: t.jobCompanies.name,
      contactName: t.jobContacts.name,
    })
    .from(t.jobTasks)
    .leftJoin(t.jobOpportunities, eq(t.jobTasks.opportunityId, t.jobOpportunities.id))
    .leftJoin(t.jobCompanies, eq(t.jobOpportunities.companyId, t.jobCompanies.id))
    .leftJoin(t.jobContacts, eq(t.jobTasks.contactId, t.jobContacts.id))
    .orderBy(sql`${t.jobTasks.dueDate} asc nulls last`, asc(t.jobTasks.createdAt));

/* ------------------------------------------------------------- documentos */

export async function listDocuments(db: ContentDb) {
  const [docs, usages] = await Promise.all([
    db.query.jobDocuments.findMany({ orderBy: [asc(t.jobDocuments.archived), asc(t.jobDocuments.kind), desc(t.jobDocuments.updatedAt)] }),
    db
      .select({ documentId: t.jobOpportunityDocuments.documentId, usedAt: t.jobOpportunityDocuments.usedAt, opportunityId: t.jobOpportunities.id, title: t.jobOpportunities.title, companyName: t.jobCompanies.name, status: t.jobOpportunities.status })
      .from(t.jobOpportunityDocuments)
      .innerJoin(t.jobOpportunities, eq(t.jobOpportunityDocuments.opportunityId, t.jobOpportunities.id))
      .leftJoin(t.jobCompanies, eq(t.jobOpportunities.companyId, t.jobCompanies.id))
      .orderBy(desc(t.jobOpportunityDocuments.usedAt)),
  ]);
  return docs.map((d) => ({ ...d, usages: usages.filter((u) => u.documentId === d.id) }));
}

/** CVs con texto, para el matching. El más reciente primero. */
export const listCvDocuments = (db: ContentDb) =>
  db.query.jobDocuments.findMany({
    where: and(eq(t.jobDocuments.kind, "cv"), isNotNull(t.jobDocuments.content), eq(t.jobDocuments.archived, false)),
    orderBy: [desc(t.jobDocuments.updatedAt)],
  });

export const listDocumentOptions = (db: ContentDb) =>
  db
    .select({ id: t.jobDocuments.id, name: t.jobDocuments.name, version: t.jobDocuments.version, kind: t.jobDocuments.kind })
    .from(t.jobDocuments)
    .where(eq(t.jobDocuments.archived, false))
    .orderBy(asc(t.jobDocuments.kind), desc(t.jobDocuments.updatedAt));

/* ---------------------------------------------------------- weekly review */

export const listWeeklyReviews = (db: ContentDb) => db.query.jobWeeklyReviews.findMany({ orderBy: [desc(t.jobWeeklyReviews.weekStart)] });

/* ------------------------------------------------------------- actividad */

export const recentActivity = (db: ContentDb, limit = 30) =>
  db
    .select({ a: t.jobActivities, title: t.jobOpportunities.title, companyName: t.jobCompanies.name, contactName: t.jobContacts.name })
    .from(t.jobActivities)
    .leftJoin(t.jobOpportunities, eq(t.jobActivities.opportunityId, t.jobOpportunities.id))
    .leftJoin(t.jobCompanies, eq(t.jobOpportunities.companyId, t.jobCompanies.id))
    .leftJoin(t.jobContacts, eq(t.jobActivities.contactId, t.jobContacts.id))
    .orderBy(desc(t.jobActivities.occurredAt))
    .limit(limit);

/* --------------------------------------------------------------- búsqueda */

/** Búsqueda global. El término va siempre como parámetro; los comodines del usuario se escapan. */
export async function search(db: ContentDb, q: string) {
  const term = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const like = (col: Parameters<typeof ilike>[0]) => ilike(col, term);
  const [opportunities, companies, contacts, interviews, notes, documents] = await Promise.all([
    db
      .select({ id: t.jobOpportunities.id, title: t.jobOpportunities.title, status: t.jobOpportunities.status, companyName: t.jobCompanies.name })
      .from(t.jobOpportunities)
      .leftJoin(t.jobCompanies, eq(t.jobOpportunities.companyId, t.jobCompanies.id))
      .where(or(like(t.jobOpportunities.title), like(t.jobCompanies.name), like(t.jobOpportunities.location), like(t.jobOpportunities.notes), like(t.jobOpportunities.description)))
      .limit(25),
    db.select({ id: t.jobCompanies.id, name: t.jobCompanies.name, tier: t.jobCompanies.tier }).from(t.jobCompanies).where(or(like(t.jobCompanies.name), like(t.jobCompanies.notes), like(t.jobCompanies.industry))).limit(25),
    db
      .select({ id: t.jobContacts.id, name: t.jobContacts.name, title: t.jobContacts.title, companyName: t.jobCompanies.name })
      .from(t.jobContacts)
      .leftJoin(t.jobCompanies, eq(t.jobContacts.companyId, t.jobCompanies.id))
      .where(or(like(t.jobContacts.name), like(t.jobContacts.title), like(t.jobContacts.email), like(t.jobContacts.notes), like(t.jobCompanies.name)))
      .limit(25),
    db
      .select({ id: t.jobInterviews.id, kind: t.jobInterviews.kind, scheduledAt: t.jobInterviews.scheduledAt, title: t.jobOpportunities.title, companyName: t.jobCompanies.name })
      .from(t.jobInterviews)
      .innerJoin(t.jobOpportunities, eq(t.jobInterviews.opportunityId, t.jobOpportunities.id))
      .leftJoin(t.jobCompanies, eq(t.jobOpportunities.companyId, t.jobCompanies.id))
      .where(or(like(t.jobInterviews.interviewerName), like(t.jobInterviews.topics), like(t.jobInterviews.notes), like(t.jobCompanies.name), like(t.jobOpportunities.title)))
      .limit(25),
    db
      .select({ id: t.jobNotes.id, body: t.jobNotes.body, opportunityId: t.jobNotes.opportunityId, contactId: t.jobNotes.contactId, companyId: t.jobNotes.companyId, interviewId: t.jobNotes.interviewId, createdAt: t.jobNotes.createdAt })
      .from(t.jobNotes)
      .where(like(t.jobNotes.body))
      .orderBy(desc(t.jobNotes.createdAt))
      .limit(25),
    db.select({ id: t.jobDocuments.id, name: t.jobDocuments.name, version: t.jobDocuments.version, kind: t.jobDocuments.kind }).from(t.jobDocuments).where(or(like(t.jobDocuments.name), like(t.jobDocuments.notes), like(t.jobDocuments.content))).limit(25),
  ]);
  return { opportunities, companies, contacts, interviews, notes, documents };
}

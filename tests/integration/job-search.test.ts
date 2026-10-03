import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as t from "@/db/schema";
import { runEngine } from "@/lib/job-search/engine";
import * as m from "@/lib/job-search/mutations";
import * as repo from "@/lib/job-search/repository";
import { contactInput, goalInput, interviewInput, opportunityInput, quickOpportunityInput } from "@/lib/job-search/validation";
import { ACTOR, connect } from "./db";

const { app: db, owner, reset, close } = connect();

afterAll(close);
beforeEach(async () => {
  await reset();
  // Reglas por defecto, zona UTC, inicio fijo: los vencimientos son deterministas.
  await m.saveGoal(
    db,
    ACTOR,
    goalInput.parse({ startDate: "2026-10-01", durationDays: "30", timezone: "UTC", weeklyApplicationTarget: "10", followupApplicationDays: "5", followupRecruiterDays: "3", followupReferralDays: "4", staleDays: "7" }),
  );
});

const NOW = new Date("2026-10-07T10:00:00Z"); // miércoles
const later = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);
const newOpp = (over: Record<string, unknown> = {}) => m.createOpportunity(db, ACTOR, opportunityInput.parse({ title: "Backend Engineer", companyName: "Acme", ...over }), NOW);

const tasksOf = (opportunityId: string) => db.select().from(t.jobTasks).where(eq(t.jobTasks.opportunityId, opportunityId)).orderBy(asc(t.jobTasks.createdAt));
const activityTypes = async (opportunityId: string) =>
  (await db.select({ type: t.jobActivities.type }).from(t.jobActivities).where(eq(t.jobActivities.opportunityId, opportunityId)).orderBy(asc(t.jobActivities.occurredAt))).map((r) => r.type);
const getOpp = async (id: string) => (await db.select().from(t.jobOpportunities).where(eq(t.jobOpportunities.id, id)))[0];

describe("opportunities and status automations", () => {
  it("creating an opportunity records history, activity, company and audit", async () => {
    const id = await newOpp();
    const o = await getOpp(id);
    expect(o.status).toBe("discovered");
    const history = await db.select().from(t.jobStatusHistory).where(eq(t.jobStatusHistory.opportunityId, id));
    expect(history).toEqual([expect.objectContaining({ fromStatus: null, toStatus: "discovered" })]);
    expect(await activityTypes(id)).toEqual(["opportunity_created"]);
    const [company] = await db.select().from(t.jobCompanies);
    expect(company.name).toBe("Acme");
    const audit = await owner.select().from(t.auditLog).where(eq(t.auditLog.entity, "jobOpportunity"));
    expect(audit).toHaveLength(1);
  });

  it("reuses companies case-insensitively", async () => {
    await newOpp();
    await newOpp({ companyName: "ACME", title: "Platform Engineer" });
    expect(await db.select().from(t.jobCompanies)).toHaveLength(1);
  });

  it("application submitted → Applied, activity and follow-up in 5 business days", async () => {
    const id = await newOpp({ status: "ready_to_apply" });
    await m.changeStatus(db, ACTOR, [id], "applied", NOW);
    const o = await getOpp(id);
    expect(o).toMatchObject({ status: "applied", appliedAt: "2026-10-07", nextFollowUpAt: "2026-10-14" });
    expect(await activityTypes(id)).toEqual(expect.arrayContaining(["status_changed", "applied"]));
    const tasks = await tasksOf(id);
    expect(tasks).toEqual([expect.objectContaining({ kind: "follow_up", dueDate: "2026-10-14", status: "open", origin: "auto:application" })]);
  });

  it("creating directly as Applied runs the same automation", async () => {
    const id = await newOpp({ status: "applied" });
    expect((await getOpp(id)).appliedAt).toBe("2026-10-07");
    expect(await tasksOf(id)).toHaveLength(1);
    const history = await db.select().from(t.jobStatusHistory).where(eq(t.jobStatusHistory.opportunityId, id));
    expect(history.map((h) => h.toStatus)).toEqual(["discovered", "applied"]);
  });

  it("a company reply records the first response and cancels the application follow-up", async () => {
    const id = await newOpp({ status: "applied" });
    await m.changeStatus(db, ACTOR, [id], "recruiter_screen", later(48));
    const o = await getOpp(id);
    expect(o.firstResponseAt?.toISOString()).toBe(later(48).toISOString());
    expect(o.nextFollowUpAt).toBeNull();
    expect((await tasksOf(id))[0].status).toBe("cancelled");
    expect(await activityTypes(id)).toContain("reply");
  });

  it("rejected → updates status, closes pending tasks and registers the outcome", async () => {
    const id = await newOpp({ status: "applied" });
    await m.createTask(db, ACTOR, { title: "Preparar", kind: "research", priority: "medium", dueDate: null, opportunityId: id, contactId: null, interviewId: null, notes: null });
    await m.changeStatus(db, ACTOR, [id], "rejected", later(1));
    const o = await getOpp(id);
    expect(o).toMatchObject({ status: "rejected", outcome: "rejected" });
    expect(o.closedAt).not.toBeNull();
    expect((await tasksOf(id)).every((x) => x.status === "cancelled")).toBe(true);
    expect(await activityTypes(id)).toContain("rejection");
  });

  it("offer → updates status and registers the outcome", async () => {
    const id = await newOpp({ status: "final_interview" });
    await m.changeStatus(db, ACTOR, [id], "offer", later(1));
    expect(await getOpp(id)).toMatchObject({ status: "offer", outcome: "offer", closedAt: null });
    expect(await activityTypes(id)).toContain("offer");
  });

  it("bulk status changes apply automations to every row; unknown ids are skipped", async () => {
    const a = await newOpp({ status: "ready_to_apply" });
    const b = await newOpp({ status: "qualified", title: "Other" });
    const n = await m.changeStatus(db, ACTOR, [a, b, "00000000-0000-4000-8000-000000000000"], "applied", NOW);
    expect(n).toBe(2);
    expect(await db.select().from(t.jobTasks)).toHaveLength(2);
  });

  it("quick add deduplicates URLs and guesses company and source from the URL", async () => {
    const input = quickOpportunityInput.parse({ url: "https://boards.greenhouse.io/acme-corp/jobs/1" });
    const first = await m.quickAddOpportunity(db, ACTOR, input, NOW);
    const again = await m.quickAddOpportunity(db, ACTOR, input, NOW);
    expect(again).toEqual({ id: first.id, duplicate: true });
    const o = await getOpp(first.id);
    expect(o).toMatchObject({ source: "company_website", title: "Oferta sin revisar (boards.greenhouse.io)" });
    const [company] = await db.select().from(t.jobCompanies);
    expect(company.name).toBe("Acme Corp");
  });

  it("inbox review qualifies or discards with a reason", async () => {
    const id = await newOpp();
    await m.reviewInboxItem(db, ACTOR, { id, decision: "discard", companyName: null, title: null, priority: "low", discardReason: "Seniority" }, NOW);
    expect(await getOpp(id)).toMatchObject({ status: "archived", discardReason: "Seniority", priority: "low" });
  });
});

describe("referrals", () => {
  it("request → referral row, activity, follow-up and status; received → cancels the follow-up", async () => {
    const id = await newOpp({ status: "qualified" });
    const contactId = await m.createContact(db, ACTOR, contactInput.parse({ name: "Ana", companyName: "Acme", kind: "employee" }), NOW);
    await m.requestReferral(db, ACTOR, { opportunityId: id, contactId, notes: null }, NOW);
    expect((await getOpp(id)).status).toBe("referral_requested");
    const [ref] = await db.select().from(t.jobReferrals);
    expect(ref).toMatchObject({ contactId, status: "requested", requestedAt: "2026-10-07" });
    expect(await tasksOf(id)).toEqual([expect.objectContaining({ kind: "follow_up", dueDate: "2026-10-13", origin: "auto:referral" })]);

    await m.updateReferral(db, ACTOR, { id: ref.id, status: "received" }, later(24));
    expect((await getOpp(id)).status).toBe("referral_received");
    expect((await db.select().from(t.jobReferrals))[0]).toMatchObject({ status: "received", receivedAt: "2026-10-08" });
    expect((await tasksOf(id))[0].status).toBe("cancelled");
    // Un solo referral: la transición de estado no duplica la fila.
    expect(await db.select().from(t.jobReferrals)).toHaveLength(1);
  });
});

describe("interviews", () => {
  it("scheduling → activity, prep and thank-you tasks, status forward, interviewer linked", async () => {
    const id = await newOpp({ status: "applied" });
    const contactId = await m.createContact(db, ACTOR, contactInput.parse({ name: "Lee", kind: "hiring_manager" }), NOW);
    const ivId = (await m.createInterview(
      db,
      ACTOR,
      interviewInput.parse({ opportunityId: id, kind: "technical", scheduledLocal: "2026-10-12T11:00", timezone: "Europe/Berlin", interviewerContactId: contactId }),
      NOW,
    )) as string;
    const [iv] = await db.select().from(t.jobInterviews).where(eq(t.jobInterviews.id, ivId));
    expect(iv.scheduledAt?.toISOString()).toBe("2026-10-12T09:00:00.000Z"); // 11:00 en Berlín (CEST)
    expect((await getOpp(id)).status).toBe("technical");
    const ivTasks = await db.select().from(t.jobTasks).where(eq(t.jobTasks.interviewId, ivId)).orderBy(asc(t.jobTasks.dueDate));
    expect(ivTasks.map((x) => [x.kind, x.dueDate])).toEqual([
      ["prepare_interview", "2026-10-11"],
      ["send_thank_you", "2026-10-13"],
    ]);
    expect(await activityTypes(id)).toContain("interview_scheduled");
    const links = await db.select().from(t.jobOpportunityContacts);
    expect(links).toEqual([expect.objectContaining({ contactId, role: "hiring_manager" })]);

    // Mover la entrevista mueve las tareas automáticas; registrar resultado deja actividad.
    await m.updateInterview(db, ACTOR, ivId, interviewInput.parse({ opportunityId: id, kind: "technical", scheduledLocal: "2026-10-14T11:00", timezone: "Europe/Berlin", outcome: "passed" }), later(24));
    const moved = await db.select().from(t.jobTasks).where(eq(t.jobTasks.interviewId, ivId)).orderBy(asc(t.jobTasks.dueDate));
    expect(moved.map((x) => x.dueDate)).toEqual(["2026-10-13", "2026-10-15"]);
    expect(await activityTypes(id)).toContain("interview_completed");
  });
});

describe("tasks, contacts and follow-ups", () => {
  it("completing a follow-up logs it and recalculates the next follow-up date", async () => {
    const id = await newOpp({ status: "applied" });
    const [task] = await tasksOf(id);
    await m.setTaskDone(db, ACTOR, task.id, true, later(24 * 7));
    const [done] = await tasksOf(id);
    expect(done.status).toBe("done");
    expect(done.completedAt).not.toBeNull();
    expect((await getOpp(id)).nextFollowUpAt).toBeNull();
    expect(await activityTypes(id)).toContain("follow_up");
  });

  it("outbound to a recruiter → contacted + follow-up in 3 business days; their reply cancels it", async () => {
    const contactId = await m.createContact(db, ACTOR, contactInput.parse({ name: "Sam", kind: "recruiter" }), NOW);
    await m.logInteraction(db, ACTOR, { contactId, direction: "outbound", summary: "LinkedIn", createFollowUp: true, opportunityId: null }, NOW);
    let [c] = await db.select().from(t.jobContacts);
    expect(c).toMatchObject({ status: "contacted", lastInteractionAt: "2026-10-07", nextFollowUpAt: "2026-10-12" });
    const acts = await db.select().from(t.jobActivities).where(eq(t.jobActivities.contactId, contactId));
    expect(acts.map((a) => a.type)).toEqual(expect.arrayContaining(["contact_created", "recruiter_contacted"]));

    await m.logInteraction(db, ACTOR, { contactId, direction: "inbound", summary: "Respondió", createFollowUp: false, opportunityId: null }, later(24));
    [c] = await db.select().from(t.jobContacts);
    expect(c).toMatchObject({ status: "in_conversation", nextFollowUpAt: null });
    const open = await db.select().from(t.jobTasks).where(and(eq(t.jobTasks.contactId, contactId), eq(t.jobTasks.status, "open")));
    expect(open).toHaveLength(0);
  });

  it("a document used in an application cannot be deleted, only archived", async () => {
    const id = await newOpp({ status: "applied" });
    const docId = (await m.saveDocument(db, ACTOR, null, { kind: "cv", name: "CV", version: "v1", url: null, content: "texto", notes: null, archived: false })) as string;
    await m.linkDocument(db, ACTOR, { opportunityId: id, documentId: docId, usedAt: null }, NOW);
    await expect(m.deleteDocument(db, ACTOR, docId)).rejects.toMatchObject({ cause: { code: "23503" } });
    expect(await activityTypes(id)).toContain("document_used");
  });
});

describe("read side", () => {
  it("loads a snapshot the engine can score", async () => {
    const id = await newOpp({ status: "applied", description: "Requirements:\n- PostgreSQL and TypeScript for 3+ years of backend work" });
    const snap = await repo.loadSnapshot(db, NOW);
    expect(snap.today).toBe("2026-10-07");
    expect(snap.opportunities).toHaveLength(1);
    const profile = await repo.loadProfile(db, ["PostgreSQL"], null, []);
    const engine = runEngine(snap, profile);
    expect(engine.scores.get(id)?.factors.find((f) => f.key === "skills")?.reason).toContain("1/2");
    expect((await repo.getOpportunity(db, id))?.tasks).toHaveLength(1);
    expect(await repo.listCompanies(db)).toEqual([expect.objectContaining({ name: "Acme", opportunities: 1, active_opportunities: 1 })]);
  });

  it("search treats LIKE wildcards in the term literally", async () => {
    await newOpp({ title: "100% remote engineer" });
    await newOpp({ title: "Onsite engineer" });
    expect((await repo.search(db, "%")).opportunities.map((o) => o.title)).toEqual(["100% remote engineer"]);
    expect((await repo.search(db, "'; drop table job_opportunities; --")).opportunities).toEqual([]);
    expect(await db.select().from(t.jobOpportunities)).toHaveLength(2);
  });
});

describe("database invariants", () => {
  it("rejects non-https URLs and out-of-range values even without the app", async () => {
    await expect(db.insert(t.jobOpportunities).values({ title: "x", url: "http://insecure.example" })).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.insert(t.jobOpportunities).values({ title: "x", scoreOverride: 101 })).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.insert(t.jobTasks).values({ title: "x", status: "done" })).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.execute(sql`insert into job_search_goal (id) values (2)`)).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("the runtime role cannot alter the job search schema", async () => {
    await expect(db.execute(sql`alter table job_opportunities add column x int`)).rejects.toThrow();
    await expect(db.execute(sql`drop table job_tasks`)).rejects.toThrow();
  });
});

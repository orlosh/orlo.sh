import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as t from "@/db/schema";
import * as m from "@/lib/admin/mutations";
import * as repo from "@/lib/content/repository";
import { experienceInput, noteInput, projectInput } from "@/lib/validation/content";
import { ACTOR, connect } from "./db";

const { app: db, owner, reset, close } = connect();

afterAll(close);
beforeEach(reset);

async function techFixture() {
  const layer = await m.createSimple(db, ACTOR, "technologyCategory", {
    name: "Backend",
    slug: "backend",
    description: null,
    position: 0,
  });
  const pg = await m.createSimple(db, ACTOR, "technology", {
    name: "PostgreSQL",
    slug: "postgresql",
    categoryId: layer,
    description: null,
    yearsOfExperience: null,
    position: 0,
  });
  return { layer, pg };
}

const project = (over: Partial<Record<string, unknown>> = {}) =>
  projectInput.parse({ slug: "demo", title: "Demo", summary: "Un proyecto", ...over });

describe("projects", () => {
  it("only exposes published projects to the public read side", async () => {
    await m.createProject(db, ACTOR, project({ slug: "public-one", published: true }));
    await m.createProject(db, ACTOR, project({ slug: "draft-one", published: false }));

    const list = await repo.findProjects(db);
    expect(list.map((p) => p.slug)).toEqual(["public-one"]);
    expect(await repo.findProjectBySlug(db, "draft-one")).toBeNull();
  });

  it("replaces technology links on update and reflects them on the stack page", async () => {
    const { pg } = await techFixture();
    const id = await m.createProject(db, ACTOR, project({ published: true, technologyIds: [pg] }));
    expect((await repo.findProjectBySlug(db, "demo"))?.technologies).toEqual([{ name: "PostgreSQL", slug: "postgresql" }]);
    const stack = await repo.findStack(db);
    expect(stack[0].technologies[0].projects).toEqual([{ title: "Demo", slug: "demo" }]);

    await m.updateProject(db, ACTOR, id, project({ published: true, title: "Renamed", technologyIds: [] }));
    const updated = await repo.findProjectBySlug(db, "demo");
    expect(updated?.title).toBe("Renamed");
    expect(updated?.technologies).toEqual([]);
  });

  it("maps a duplicate slug to a field error", async () => {
    await m.createProject(db, ACTOR, project());
    const err = await m.createProject(db, ACTOR, project()).catch((e) => e);
    expect(m.describeDbError(err)).toEqual({ message: expect.any(String), field: "slug" });
  });

  it("returns false when updating or deleting a missing row", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    expect(await m.updateProject(db, ACTOR, missing, project())).toBe(false);
    expect(await m.deleteProject(db, ACTOR, missing)).toBe(false);
  });

  it("drops a malformed stored diagram instead of breaking the page", async () => {
    const id = await m.createProject(db, ACTOR, project({ published: true }));
    await owner.update(t.projects).set({ diagram: { nodes: "nope" } }).where(eq(t.projects.id, id));
    expect((await repo.findProjectBySlug(db, "demo"))?.diagram).toBeNull();
  });
});

describe("experience", () => {
  const exp = (over: Record<string, unknown>) =>
    experienceInput.parse({ company: "Acme", role: "Dev", startDate: "2020-01-01", ...over });

  it("lists current roles first, then by start date, and hides invisible ones", async () => {
    await m.createExperience(db, ACTOR, exp({ role: "Old", startDate: "2019-01-01", endDate: "2020-01-01" }));
    await m.createExperience(db, ACTOR, exp({ role: "Current", startDate: "2018-01-01" }));
    await m.createExperience(db, ACTOR, exp({ role: "Recent", startDate: "2021-01-01", endDate: "2022-01-01" }));
    await m.createExperience(db, ACTOR, exp({ role: "Hidden", startDate: "2023-01-01", visible: false }));

    const list = await repo.findExperience(db);
    expect(list.map((e) => e.role)).toEqual(["Current", "Recent", "Old"]);
  });

  it("never exposes the private employer or client, only the public label", async () => {
    await m.createExperience(db, ACTOR, exp({ company: "Private Corp", client: "Secret Client" }));
    await m.createExperience(db, ACTOR, exp({ company: "Other Corp", publicCompany: "Consultora", startDate: "2019-01-01" }));
    const list = await repo.findExperience(db);
    expect(list.map((e) => e.company)).toEqual([null, "Consultora"]);
    const serialized = JSON.stringify(list);
    for (const secret of ["Private Corp", "Secret Client", "Other Corp"]) expect(serialized).not.toContain(secret);
  });

  it("stores highlights in order and replaces them on update", async () => {
    const id = await m.createExperience(db, ACTOR, exp({ highlights: ["uno", "dos"] }));
    expect((await repo.findExperience(db))[0].highlights).toEqual(["uno", "dos"]);
    await m.updateExperience(db, ACTOR, id, exp({ highlights: ["tres"] }));
    expect((await repo.findExperience(db))[0].highlights).toEqual(["tres"]);
  });
});

describe("notes", () => {
  const note = (over: Record<string, unknown>) =>
    noteInput.parse({ slug: "nota", title: "Nota", excerpt: "e", body: "cuerpo de la nota", ...over });

  it("sets publishedAt on first publication and keeps it on later edits", async () => {
    const id = await m.createNote(db, ACTOR, note({ published: false, tags: ["Docker", "docker ", "CI/CD"] }));
    expect(await repo.findNotes(db)).toEqual([]);

    await m.updateNote(db, ACTOR, id, note({ published: true, tags: ["Docker", "CI/CD"] }));
    const first = await repo.findNoteBySlug(db, "nota");
    expect(first?.tags.map((tg) => tg.slug).sort()).toEqual(["ci-cd", "docker"]);

    await new Promise((r) => setTimeout(r, 20));
    await m.updateNote(db, ACTOR, id, note({ published: true, title: "Editada", tags: [] }));
    const second = await repo.findNoteBySlug(db, "nota");
    expect(second?.title).toBe("Editada");
    expect(second?.publishedAt).toBe(first?.publishedAt);
  });
});

describe("stack", () => {
  it("refuses to delete a layer that still has technologies", async () => {
    const { layer } = await techFixture();
    const err = await m.deleteSimple(db, ACTOR, "technologyCategory", layer).catch((e) => e);
    expect(m.describeDbError(err)?.message).toMatch(/No se puede eliminar/);
  });

  it("treats technology names as case-insensitively unique", async () => {
    const { layer } = await techFixture();
    const err = await m
      .createSimple(db, ACTOR, "technology", {
        name: "postgresql",
        slug: "postgres-2",
        categoryId: layer,
        description: null,
        yearsOfExperience: null,
        position: 0,
      })
      .catch((e) => e);
    expect(m.describeDbError(err)?.field).toBe("name");
  });
});

describe("audit log", () => {
  it("records every mutation with actor, entity, changed fields and IP", async () => {
    const id = await m.createProject(db, ACTOR, project());
    await m.deleteProject(db, ACTOR, id);
    await m.updateProfile(db, ACTOR, { displayName: "A", headline: "B", location: null, summary: "C", contactEmail: null });

    const rows = await owner.select().from(t.auditLog).orderBy(t.auditLog.id);
    expect(rows.map((r) => [r.action, r.entity])).toEqual([
      ["create", "project"],
      ["delete", "project"],
      ["update", "profile"],
    ]);
    expect(rows[0]).toMatchObject({ actorId: "admin-1", entityId: id, ipAddress: "203.0.113.7" });
    expect((rows[2].metadata as { fields: string[] }).fields).toContain("headline");
  });
});

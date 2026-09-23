import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as t from "@/db/schema";
import * as m from "@/lib/admin/mutations";
import * as repo from "@/lib/content/repository";
import { projectInput } from "@/lib/validation/content";
import { ACTOR, connect } from "./db";

const { app: db, appClient, reset, close } = connect();

afterAll(close);
beforeEach(reset);

/** postgres.js envuelve los errores del driver; el SQLSTATE está en el error o en su causa. */
const sqlState = (e: unknown) => (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;

describe("least privilege: runtime role", () => {
  it("can append to the audit log but never rewrite or erase it", async () => {
    await m.createProject(db, ACTOR, projectInput.parse({ slug: "x", title: "X", summary: "x" }));
    const update = await db.update(t.auditLog).set({ action: "forged" }).catch((e) => e);
    const del = await db.delete(t.auditLog).catch((e) => e);
    expect(sqlState(update)).toBe("42501"); // insufficient_privilege
    expect(sqlState(del)).toBe("42501");
  });

  it("cannot change the schema", async () => {
    const create = await appClient`create table pwned (id int)`.catch((e) => e);
    const drop = await appClient`drop table projects`.catch((e) => e);
    expect(sqlState(create)).toBe("42501");
    expect(sqlState(drop)).toBe("42501");
  });
});

describe("injection and constraints", () => {
  it("treats SQL in a lookup parameter as data", async () => {
    await m.createProject(db, ACTOR, projectInput.parse({ slug: "real", title: "R", summary: "r", published: true }));
    expect(await repo.findProjectBySlug(db, "' OR '1'='1")).toBeNull();
    expect(await repo.findProjectBySlug(db, "real'; DROP TABLE projects; --")).toBeNull();
    expect(await repo.findProjects(db)).toHaveLength(1);
  });

  it("enforces invariants in the database even if application validation is bypassed", async () => {
    const badSlug = await db.insert(t.projects).values({ slug: "Bad Slug", title: "x", summary: "x" }).catch((e) => e);
    const httpUrl = await db
      .insert(t.projects)
      .values({ slug: "ok", title: "x", summary: "x", repositoryUrl: "http://insecure.example" })
      .catch((e) => e);
    const dates = await db
      .insert(t.experiences)
      .values({ company: "x", role: "x", startDate: "2024-01-01", endDate: "2023-01-01" })
      .catch((e) => e);
    const noDate = await db
      .insert(t.notes)
      .values({ slug: "n", title: "n", excerpt: "n", body: "n", published: true, publishedAt: null })
      .catch((e) => e);
    for (const err of [badSlug, httpUrl, dates, noDate]) expect(sqlState(err)).toBe("23514"); // check_violation
  });

  it("keeps the profile a singleton", async () => {
    const err = await db
      .execute(sql`insert into profile (id, display_name, headline, summary) values (2, 'a', 'b', 'c')`)
      .catch((e) => e);
    expect(sqlState(err)).toBe("23514");
  });
});

import { describe, expect, it } from "vitest";
import { diagramSchema, experienceInput, noteInput, projectInput, slugify, socialLinkInput } from "@/lib/validation/content";

describe("projectInput", () => {
  const base = { slug: "demo", title: "Demo", summary: "Resumen" };

  it("normalises empty optional fields to null", () => {
    const p = projectInput.parse({ ...base, repositoryUrl: "", overview: "  ", status: "" });
    expect(p).toMatchObject({ repositoryUrl: null, overview: null, status: null, published: false });
  });

  it.each(["http://example.com", "javascript:alert(1)", "ftp://x", "not a url"])("rejects non-https URL %s", (url) => {
    expect(projectInput.safeParse({ ...base, repositoryUrl: url }).success).toBe(false);
  });

  it.each(["Demo", "demo project", "demo--x", "-demo", "demo_1", "démo"])("rejects slug %s", (slug) => {
    expect(projectInput.safeParse({ ...base, slug }).success).toBe(false);
  });

  it("requires alt text on images", () => {
    expect(projectInput.safeParse({ ...base, images: [{ url: "/a.png", alt: "" }] }).success).toBe(false);
    expect(projectInput.safeParse({ ...base, images: [{ url: "/a.png", alt: "Captura" }] }).success).toBe(true);
  });
});

describe("experienceInput", () => {
  const base = { company: "Acme", role: "Dev", startDate: "2024-01-01" };

  it("accepts an open-ended current position", () => {
    expect(experienceInput.parse({ ...base, endDate: "" }).endDate).toBeNull();
  });

  it("rejects an end date before the start date", () => {
    const r = experienceInput.safeParse({ ...base, endDate: "2023-12-31" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["endDate"]);
  });

  it("rejects malformed dates", () => {
    expect(experienceInput.safeParse({ ...base, startDate: "01/01/2024" }).success).toBe(false);
  });
});

describe("noteInput", () => {
  it("caps the number of tags", () => {
    const tags = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(noteInput.safeParse({ slug: "n", title: "t", excerpt: "e", body: "b", tags }).success).toBe(false);
  });
});

describe("socialLinkInput", () => {
  it("allows https and mailto only", () => {
    const ok = (url: string) => socialLinkInput.safeParse({ kind: "other", label: "x", url }).success;
    expect(ok("https://github.com/x")).toBe(true);
    expect(ok("mailto:a@b.c")).toBe(true);
    expect(ok("javascript:alert(1)")).toBe(false);
    expect(ok("http://x.y")).toBe(false);
  });
});

describe("diagramSchema", () => {
  const node = (id: string) => ({ id, label: id, lane: 0, column: 0 });

  it("rejects edges pointing to unknown nodes", () => {
    const r = diagramSchema.safeParse({ nodes: [node("a")], edges: [{ from: "a", to: "b" }] });
    expect(r.success).toBe(false);
  });

  it("rejects duplicate node ids", () => {
    expect(diagramSchema.safeParse({ nodes: [node("a"), node("a")], edges: [] }).success).toBe(false);
  });

  it("rejects the sentinel produced by malformed JSON", () => {
    expect(diagramSchema.safeParse({ __invalidJson: true }).success).toBe(false);
  });
});

describe("slugify", () => {
  it.each([
    ["Sistemas operativos", "sistemas-operativos"],
    ["CI/CD & Docker", "ci-cd-docker"],
    ["  Técnico Superior ", "tecnico-superior"],
    [".NET", "net"],
  ])("%s → %s", (input, out) => expect(slugify(input)).toBe(out));
});

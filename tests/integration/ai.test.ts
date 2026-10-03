import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as t from "@/db/schema";
import { addApiKey, aiSettingsInput, listApiKeys, saveAiSettings } from "@/lib/ai/admin";
import { generateCoverLetter, importOpportunity } from "@/lib/ai/features";
import { AiError } from "@/lib/ai/gemini";
import { runRadar } from "@/lib/ai/radar";
import { aiContext, dbKeyStore } from "@/lib/ai/store";
import * as m from "@/lib/job-search/mutations";
import { opportunityInput } from "@/lib/job-search/validation";
import { ACTOR, connect } from "./db";

const { app: db, owner, reset, close } = connect();
afterAll(close);

const SECRET = "integration-secret-".padEnd(48, "x");
const NOW = new Date("2026-10-07T10:00:00Z");
const CV = [
  "Backend Engineer en Foo (2020 – actualidad)",
  "- Diseñé y operé APIs REST en Node.js y TypeScript que atendían 2M peticiones al día",
  "- Migré esquemas de PostgreSQL sin parada usando Docker",
].join("\n");

/* -------------------------------------------- web y Gemini simulados */

type Gemini = (prompt: string, key: string) => Response;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const answer = (obj: unknown, extra: Record<string, unknown> = {}) => json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP", ...extra }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } });
const html = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

function fakeWeb(gemini: Gemini, pages: Record<string, () => Response>) {
  const calls: { url: string; key?: string; prompt?: string }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://generativelanguage.googleapis.com/")) {
      const body = JSON.parse(String(init?.body));
      const key = (init?.headers as Record<string, string>)["x-goog-api-key"];
      const prompt = body.contents[0].parts[0].text as string;
      calls.push({ url, key, prompt });
      return gemini(prompt, key);
    }
    calls.push({ url });
    const page = pages[url];
    return page ? page() : new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

// Hosts como IP literal pública: así la protección SSRF no necesita DNS en los tests.
const JOB_URL = "https://93.184.216.34/jobs/backend";
const JOB_HTML = `<html><head><title>Backend</title><script type="application/ld+json">${JSON.stringify({
  "@type": "JobPosting",
  title: "Senior Backend Engineer",
  description: "<p>Requisitos: Node.js, TypeScript, PostgreSQL, Kubernetes. 5+ años.</p>",
  datePosted: "2026-10-01",
  hiringOrganization: { name: "Initech" },
  jobLocationType: "TELECOMMUTE",
  baseSalary: { currency: "EUR", value: { minValue: 60000, maxValue: 75000, unitText: "YEAR" } },
})}</script></head><body><h1>Senior Backend Engineer</h1><p>${"Construimos APIs. ".repeat(20)}</p></body></html>`;

const EXTRACTION = {
  title: "Backend Engineer (Senior)",
  summary: "Diseñar APIs para pagos.",
  company: "Initech Ltd",
  workplace: "remote",
  requirements: ["Node.js", "PostgreSQL", "Kubernetes"],
  ghostRisk: "low",
  redFlags: [],
  // Estimación: no debe acabar en los campos de salario.
  salaryMin: 99000,
  salaryIsEstimate: true,
};
const MATCH = {
  score: 86,
  verdict: "Encaja salvo Kubernetes",
  recommendation: "apply",
  strengths: [
    { point: "APIs en Node.js", evidence: "Diseñé y operé APIs REST en Node.js y TypeScript que atendían 2M peticiones al día" },
    { point: "Liderazgo", evidence: "Lideré un equipo de 15 personas en Google" },
  ],
  gaps: [{ point: "Kubernetes", severity: "medium", mitigation: "Mencionar Docker" }],
};

async function setup({ enabled = true, keys = 2 } = {}) {
  await reset();
  await saveAiSettings(
    db,
    ACTOR,
    aiSettingsInput.parse({
      enabled,
      modelDefault: "gemini-test",
      modelLight: "gemini-test-lite",
      useSearch: true,
      autoMatch: true,
      cvDocumentId: "",
      radarEnabled: true,
      radarQueries: "Backend Engineer Node.js",
      radarMinMatch: "80",
      radarMaxPerRun: "5",
      radarMaxAgeDays: "14",
      radarFrequencyDays: "1",
      timeBudgetSeconds: "120",
    }),
  );
  for (let i = 1; i <= keys; i++) await addApiKey(db, ACTOR, { label: `Proyecto ${i}`, apiKey: `AIzaTestKeyNumber${i}xxxxxxxxxxxx` }, SECRET);
  await m.saveDocument(db, ACTOR, null, { kind: "cv", name: "CV backend", version: "v3", url: null, content: CV, notes: null, archived: false });
}

beforeEach(() => setup());

describe("keys", () => {
  it("stores keys encrypted and never exposes them to the panel", async () => {
    const [row] = await owner.select().from(t.aiApiKeys).where(eq(t.aiApiKeys.label, "Proyecto 1"));
    expect(row.keyCiphertext).not.toContain("AIza");
    expect(row.keyLast4).toBe("xxxx");
    const listed = await listApiKeys(db);
    expect(Object.keys(listed[0])).not.toContain("keyCiphertext");
    const keys = await dbKeyStore(db, SECRET).keys();
    expect(keys.map((k) => k.apiKey)).toEqual(["AIzaTestKeyNumber1xxxxxxxxxxxx", "AIzaTestKeyNumber2xxxxxxxxxxxx"]);
    // Con otro secreto de servidor, las claves no se pueden usar (y no se envía basura a Google).
    expect(await dbKeyStore(db, "other-secret".padEnd(40, "z")).keys()).toEqual([]);
    const audit = await owner.select().from(t.auditLog).where(eq(t.auditLog.entity, "aiApiKey"));
    expect(JSON.stringify(audit)).not.toContain("AIza");
  });

  it("refuses to run while AI is disabled in the panel", async () => {
    await setup({ enabled: false });
    await expect(aiContext(db, SECRET)).rejects.toMatchObject({ kind: "disabled" });
  });
});

describe("import from URL", () => {
  it("reads the page, merges JSON-LD over the AI, rotates keys on 429 and verifies CV quotes", async () => {
    let first = true;
    const web = fakeWeb(
      (prompt) => {
        if (first) {
          first = false;
          return json(429, { error: { code: 429, message: "Resource exhausted", details: [{ retryDelay: "30s" }] } });
        }
        if (prompt.includes("Extrae la información")) return answer(EXTRACTION, { groundingMetadata: { groundingChunks: [{ web: { uri: "https://news.example/initech", title: "Initech" } }] } });
        if (prompt.includes("Evalúa el encaje")) return answer(MATCH);
        throw new Error(`prompt inesperado: ${prompt.slice(0, 80)}`);
      },
      { [JOB_URL]: () => html(JOB_HTML) },
    );
    const ctx = await aiContext(db, SECRET, { fetchImpl: web.fetchImpl, now: () => NOW });
    const r = await importOpportunity(ctx, ACTOR, { url: JOB_URL });
    expect(r.created).toBe(true);

    const opp = await db.query.jobOpportunities.findFirst({ where: eq(t.jobOpportunities.id, r.id), with: { company: true } });
    // Lo publicado por la oferta manda: título, empresa, salario real (no la estimación).
    expect(opp).toMatchObject({ title: "Senior Backend Engineer", url: JOB_URL, workplace: "remote", salaryMin: 60000, salaryMax: 75000, salaryCurrency: "EUR", postedAt: "2026-10-01", status: "discovered" });
    expect(opp?.company?.name).toBe("Initech");
    expect(opp?.description).toContain("Kubernetes");
    expect(opp?.aiAnalysis).toMatchObject({ summary: "Diseñar APIs para pagos.", sources: [{ uri: "https://news.example/initech" }], fetchedByServer: true });

    // Encaje: la cita inventada queda marcada como no verificada.
    const match = opp?.aiMatch as { score: number; strengths: { verified: boolean }[]; verifiedRatio: number; cvName: string };
    expect(match.score).toBe(86);
    expect(match.strengths.map((s) => s.verified)).toEqual([true, false]);
    expect(match.verifiedRatio).toBe(0.5);
    expect(match.cvName).toBe("CV backend (v3)");

    // La primera clave quedó en espera; la segunda atendió las dos llamadas.
    const keys = await listApiKeys(db);
    expect(keys[0].cooldownUntil?.toISOString()).toBe(new Date(NOW.getTime() + 30_000).toISOString());
    expect(keys[1].successCount).toBe(2);
    const runs = await db.select().from(t.aiRuns);
    expect(runs.map((x) => [x.feature, x.status, x.attempts])).toEqual(
      expect.arrayContaining([
        ["import", "ok", 2],
        ["match", "ok", 1],
      ]),
    );
    // El CV y la oferta se enviaron como datos delimitados, no como instrucciones sueltas.
    expect(web.calls.find((c) => c.prompt?.includes("Evalúa el encaje"))?.prompt).toContain("<<<CANDIDATO");
  });

  it("only fills gaps when re-analysing an existing opportunity", async () => {
    const id = await m.createOpportunity(db, ACTOR, opportunityInput.parse({ title: "Mi título", companyName: "Initech", url: JOB_URL, location: "Mi ubicación" }), NOW);
    const web = fakeWeb((p) => (p.includes("Extrae") ? answer(EXTRACTION) : answer(MATCH)), { [JOB_URL]: () => html(JOB_HTML) });
    await importOpportunity(await aiContext(db, SECRET, { fetchImpl: web.fetchImpl, now: () => NOW }), ACTOR, { opportunityId: id });
    const opp = await db.query.jobOpportunities.findFirst({ where: eq(t.jobOpportunities.id, id) });
    expect(opp).toMatchObject({ title: "Mi título", location: "Mi ubicación", salaryMin: 60000, postedAt: "2026-10-01" });
  });
});

describe("cover letter", () => {
  it("saves the letter as a document and flags claims without a CV quote", async () => {
    const id = await m.createOpportunity(db, ACTOR, opportunityInput.parse({ title: "Backend", companyName: "Initech", description: "Node.js y PostgreSQL" }), NOW);
    const web = fakeWeb(
      () =>
        answer({
          subject: "Candidatura Backend",
          letter: "Hola equipo de Initech…",
          claims: [
            { claim: "Migré PostgreSQL sin parada", evidence: "Migré esquemas de PostgreSQL sin parada usando Docker" },
            { claim: "Hablo cinco idiomas", evidence: "Hablo cinco idiomas con fluidez" },
          ],
        }),
      {},
    );
    const r = await generateCoverLetter(await aiContext(db, SECRET, { fetchImpl: web.fetchImpl, now: () => NOW }), ACTOR, { opportunityId: id, language: "es", tone: "cercano", length: "corta", notes: null });
    expect(r).toMatchObject({ unverified: 1, total: 2 });
    const doc = await db.query.jobDocuments.findFirst({ where: eq(t.jobDocuments.id, r.documentId) });
    expect(doc).toMatchObject({ kind: "cover_letter", generated: true, opportunityId: id });
    expect(doc?.content).toContain("Asunto: Candidatura Backend");
    expect(doc?.notes).toContain("Hablo cinco idiomas");
  });
});

describe("radar", () => {
  it("verifies links, skips duplicates, evaluates within limits and adds matches ≥ threshold to the inbox", async () => {
    const DUP = "https://93.184.216.34/jobs/already-saved";
    await m.createOpportunity(db, ACTOR, opportunityInput.parse({ title: "Ya guardada", url: DUP }), NOW);
    const GOOD = "https://93.184.216.34/jobs/good";
    const WEAK = "https://93.184.216.34/jobs/weak";
    const DEAD = "https://93.184.216.34/jobs/dead";
    const body = (title: string) => html(`<h1>${title}</h1><p>${"Node.js TypeScript PostgreSQL. ".repeat(15)}</p>`);
    const web = fakeWeb(
      (prompt) => {
        if (prompt.includes("Busca ofertas")) {
          return answer({
            jobs: [
              { title: "Good", company: "Acme", url: `${GOOD}?utm_source=x` },
              { title: "Weak", company: "Hooli", url: WEAK },
              { title: "Dead", company: "Gone", url: DEAD },
              { title: "Dup", company: "X", url: DUP },
              { title: "Inventada", url: "javascript:alert(1)" },
            ],
          });
        }
        return answer(prompt.includes("<h1>") || prompt.includes("Good") ? { ...MATCH, score: 90 } : { ...MATCH, score: 55 });
      },
      { [GOOD]: () => body("Good"), [WEAK]: () => body("Weak") },
    );
    const ctx = await aiContext(db, SECRET, { fetchImpl: web.fetchImpl, now: () => NOW });
    const r = await runRadar(ctx, "manual", ACTOR);
    expect(r).toMatchObject({ found: 3, evaluated: 2, added: 1, status: "ok" });

    const leads = await db.select().from(t.jobLeads);
    const by = Object.fromEntries(leads.map((l) => [l.title, l]));
    expect(by.Good).toMatchObject({ status: "added", matchScore: 90, url: GOOD });
    expect(by.Weak).toMatchObject({ status: "below_threshold", matchScore: 55 });
    expect(by.Dead).toMatchObject({ status: "unreachable" });
    expect(leads.find((l) => l.title === "Dup")).toBeUndefined();

    const added = await db.query.jobOpportunities.findFirst({ where: eq(t.jobOpportunities.url, GOOD) });
    expect(added).toMatchObject({ source: "radar", status: "discovered" });
    expect((added?.aiMatch as { score: number }).score).toBe(90);

    const [run] = await db.select().from(t.jobRadarRuns);
    expect(run).toMatchObject({ trigger: "manual", status: "ok", added: 1 });
    expect((await db.select().from(t.aiSettings))[0].radarLastRunAt).not.toBeNull();

    // Segunda pasada: nada nuevo que evaluar.
    const again = await runRadar(ctx, "manual", ACTOR);
    expect(again).toMatchObject({ found: 0, evaluated: 0, added: 0 });
  });

  it("leaves leads pending when the quota runs out and picks them up next time", async () => {
    await setup({ keys: 1 });
    const A = "https://93.184.216.34/jobs/a";
    let quota = true;
    const web = fakeWeb(
      (prompt) => {
        if (prompt.includes("Busca ofertas")) return answer({ jobs: [{ title: "A", url: A }] });
        if (quota) return json(429, { error: { code: 429, message: "exhausted", details: [{ retryDelay: "1s" }] } });
        return answer({ ...MATCH, score: 95 });
      },
      { [A]: () => html(`<h1>A</h1><p>${"Node.js ".repeat(60)}</p>`) },
    );
    let clock = NOW;
    const ctx = await aiContext(db, SECRET, { fetchImpl: web.fetchImpl, now: () => clock });
    const first = await runRadar(ctx, "manual", ACTOR);
    expect(first).toMatchObject({ evaluated: 1, added: 0, status: "partial" });
    expect((await db.select().from(t.jobLeads))[0].status).toBe("new");

    quota = false;
    clock = new Date(NOW.getTime() + 60_000);
    const second = await runRadar(ctx, "manual", ACTOR);
    expect(second).toMatchObject({ added: 1, status: "ok" });
  });

  it("requires web access and a CV", async () => {
    await db.update(t.aiSettings).set({ useSearch: false });
    await expect(runRadar(await aiContext(db, SECRET), "manual", ACTOR)).rejects.toBeInstanceOf(AiError);
  });
});

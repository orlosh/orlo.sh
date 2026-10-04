import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as t from "@/db/schema";
import { addApiKey, aiSettingsInput, listApiKeys, saveAiSettings, saveSourceKeys } from "@/lib/ai/admin";
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
// Credenciales inventadas para los tests de las fuentes del radar (no son claves reales).
const FAKE_ADZUNA_KEY = "fake-adzuna-key-y123"; // gitleaks:allow
const FAKE_BRAVE_KEY = "fake-brave-key-y456"; // gitleaks:allow
const NOW = new Date("2026-10-07T10:00:00Z");
const CV = [
  "Backend Engineer en Foo (2020 – actualidad)",
  "- Diseñé y operé APIs REST en Node.js y TypeScript que atendían 2M peticiones al día",
  "- Migré esquemas de PostgreSQL sin parada usando Docker",
].join("\n");

/** Reloj simulado: las esperas por ritmo o por límite avanzan el tiempo en lugar de dormir. */
function clock(start = NOW) {
  let t = start.getTime();
  return { now: () => new Date(t), sleep: async (ms: number) => void (t += ms), set: (d: Date) => (t = d.getTime()) };
}

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
    // Clave exacta o prefijo terminado en "*".
    const page = pages[url] ?? Object.entries(pages).find(([k]) => k.endsWith("*") && url.startsWith(k.slice(0, -1)))?.[1];
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
})}</script></head><body><h1>Senior Backend Engineer</h1><p>${"Construimos APIs de pagos para millones de usuarios. ".repeat(20)}</p></body></html>`;

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
      requestsPerMinute: "5",
      radarSources: ["google"],
      urlContextFallbackOnly: true,
      modelFallback: true,
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

  it("reserves rate-limit slots atomically across concurrent callers", async () => {
    const store = dbKeyStore(db, SECRET);
    const [key] = await store.keys();
    const slots = await Promise.all([1, 2, 3].map(() => store.reserve(key.id, "gemini-test", 12_000, NOW)));
    const offsets = slots.map((d) => d.getTime() - NOW.getTime()).sort((a, b) => a - b);
    expect(offsets).toEqual([0, 12_000, 24_000]);
    // Otro modelo tiene su propio ritmo.
    expect((await store.reserve(key.id, "gemini-test-lite", 12_000, NOW)).getTime()).toBe(NOW.getTime());
  });

  it("refuses to run while AI is disabled in the panel", async () => {
    await setup({ enabled: false });
    await expect(aiContext(db, SECRET)).rejects.toMatchObject({ kind: "disabled" });
  });
});

describe("import from URL", () => {
  it("reads the page, merges JSON-LD over the AI, rotates keys on 429 and verifies CV quotes", async () => {
    const web = fakeWeb(
      (prompt, key) => {
        if (key === "AIzaTestKeyNumber1xxxxxxxxxxxx") return json(429, { error: { code: 429, message: "Resource exhausted", details: [{ retryDelay: "30s" }] } });
        if (prompt.includes("Extrae la información")) return answer(EXTRACTION, { groundingMetadata: { groundingChunks: [{ web: { uri: "https://news.example/initech", title: "Initech" } }] } });
        if (prompt.includes("Evalúa el encaje")) return answer(MATCH);
        throw new Error(`prompt inesperado: ${prompt.slice(0, 80)}`);
      },
      { [JOB_URL]: () => html(JOB_HTML) },
    );
    const ctx = await aiContext(db, SECRET, { fetchImpl: web.fetchImpl, ...clock() });
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

    // La primera clave quedó en espera solo para ese modelo; la segunda atendió las dos llamadas.
    const keys = await listApiKeys(db);
    expect(keys[0].cooldownUntil).toBeNull();
    const [k1] = await db.select().from(t.aiKeyModels).where(eq(t.aiKeyModels.keyId, keys[0].id));
    expect(k1).toMatchObject({ model: "gemini-test", failureCount: 1 });
    expect(k1.cooldownUntil?.toISOString()).toBe(new Date(NOW.getTime() + 30_000).toISOString());
    expect(keys[1].successCount).toBe(2);
    const runs = await db.select().from(t.aiRuns);
    expect(runs.map((x) => [x.feature, x.status, x.attempts])).toEqual(
      expect.arrayContaining([
        ["import", "ok", 3], // clave 1 con Search, clave 1 sin Search, clave 2
        ["match", "ok", 1],
      ]),
    );
    // El CV y la oferta se enviaron como datos delimitados, no como instrucciones sueltas.
    expect(web.calls.find((c) => c.prompt?.includes("Evalúa el encaje"))?.prompt).toContain("<<<CANDIDATO");
  });

  it("lets Gemini read the URL only when the server could not", async () => {
    const bodies: string[] = [];
    const web = fakeWeb((p) => (p.includes("Extrae") ? answer(EXTRACTION) : answer(MATCH)), { [JOB_URL]: () => html(JOB_HTML) });
    const spy = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("generativelanguage")) bodies.push(String(init?.body));
      return web.fetchImpl(input, init);
    }) as typeof fetch;
    await importOpportunity(await aiContext(db, SECRET, { fetchImpl: spy, ...clock() }), ACTOR, { url: JOB_URL });
    expect(JSON.parse(bodies[0]).tools).toEqual([{ googleSearch: {} }]);

    const DEAD = "https://93.184.216.34/jobs/spa";
    await importOpportunity(await aiContext(db, SECRET, { fetchImpl: spy, ...clock() }), ACTOR, { url: DEAD });
    const last = bodies.map((b) => JSON.parse(b)).filter((b) => b.contents[0].parts[0].text.includes("Extrae")).at(-1);
    expect(last.tools).toEqual([{ googleSearch: {} }, { urlContext: {} }]);
  });

  it("only fills gaps when re-analysing an existing opportunity", async () => {
    const id = await m.createOpportunity(db, ACTOR, opportunityInput.parse({ title: "Mi título", companyName: "Initech", url: JOB_URL, location: "Mi ubicación" }), NOW);
    const web = fakeWeb((p) => (p.includes("Extrae") ? answer(EXTRACTION) : answer(MATCH)), { [JOB_URL]: () => html(JOB_HTML) });
    await importOpportunity(await aiContext(db, SECRET, { fetchImpl: web.fetchImpl, ...clock() }), ACTOR, { opportunityId: id });
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
    const r = await generateCoverLetter(await aiContext(db, SECRET, { fetchImpl: web.fetchImpl, ...clock() }), ACTOR, { opportunityId: id, language: "es", tone: "cercano", length: "corta", notes: null });
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
    const ctx = await aiContext(db, SECRET, { fetchImpl: web.fetchImpl, ...clock() });
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
    const c = clock();
    const ctx = await aiContext(db, SECRET, { fetchImpl: web.fetchImpl, ...c });
    const first = await runRadar(ctx, "manual", ACTOR);
    // Esperó y reintentó dentro de su presupuesto, pero la cuota no volvió: queda pendiente.
    expect(first).toMatchObject({ evaluated: 1, added: 0, status: "partial" });
    expect((await db.select().from(t.jobLeads))[0].status).toBe("new");

    quota = false;
    c.set(new Date(NOW.getTime() + 10 * 60_000));
    const second = await runRadar(ctx, "manual", ACTOR);
    expect(second).toMatchObject({ added: 1, status: "ok" });
  });

  it("works on the free plan with public sources: target companies' boards and job APIs", async () => {
    await db.update(t.aiSettings).set({ radarSources: ["companies", "remotive"], useSearch: false });
    const co = await m.createCompany(db, ACTOR, { name: "Globex", tier: "a", interest: null, website: null, careersUrl: "https://jobs.lever.co/globex", industry: null, notes: null, nextAction: null, nextActionAt: null, archived: false });
    expect(co).toBeTruthy();
    const desc = "Node.js TypeScript PostgreSQL. ".repeat(20);
    const web = fakeWeb((prompt) => {
      if (prompt.includes("Busca ofertas")) throw new Error("no debería usar Google Search");
      return answer(prompt.includes("Backend Engineer") ? { ...MATCH, score: 92 } : { ...MATCH, score: 40 });
    }, {
      "https://api.lever.co/v0/postings/globex?mode=json": () =>
        json(200, [
          { text: "Backend Engineer", hostedUrl: "https://jobs.lever.co/globex/1", categories: { location: "Remote" }, createdAt: NOW.getTime() - 86_400_000, descriptionPlain: desc },
          { text: "Office Manager", hostedUrl: "https://jobs.lever.co/globex/2", categories: { location: "Remote" }, createdAt: NOW.getTime(), descriptionPlain: desc },
        ]),
      "https://remotive.com/api/remote-jobs?search=backend%20engineer%20node%20js&limit=50": () =>
        json(200, { jobs: [{ title: "Senior Backend Engineer Node.js", url: "https://remotive.com/remote-jobs/9", company_name: "Initech", candidate_required_location: "Europe", publication_date: "2026-10-05T00:00:00", description: `<p>${desc}</p>` }] }),
    });
    const r = await runRadar(await aiContext(db, SECRET, { fetchImpl: web.fetchImpl, ...clock() }), "manual", ACTOR);
    const [run] = await db.select().from(t.jobRadarRuns);
    expect(r, JSON.stringify(run.log)).toMatchObject({ found: 2, evaluated: 2, added: 2 });
    const leads = await db.select().from(t.jobLeads);
    expect(leads.map((l) => [l.title, l.source, l.status]).sort()).toEqual([
      ["Backend Engineer", "lever", "added"],
      ["Senior Backend Engineer Node.js", "remotive", "added"],
    ]);
    // Las ofertas de APIs oficiales no se descargan de nuevo: el texto ya venía en la respuesta.
    expect(web.calls.some((c) => c.url.startsWith("https://jobs.lever.co/"))).toBe(false);
    // Ninguna llamada a Gemini pidió Google Search.
    expect(web.calls.filter((c) => c.prompt).length).toBe(2);
  });

  it("stores source credentials encrypted and uses Adzuna and Brave-discovered boards", async () => {
    await saveSourceKeys(db, ACTOR, { provider: "adzuna", clear: false, appId: "myapp", appKey: FAKE_ADZUNA_KEY, country: "es" }, SECRET);
    await saveSourceKeys(db, ACTOR, { provider: "brave", clear: false, apiKey: FAKE_BRAVE_KEY }, SECRET);
    const [row] = await owner.select().from(t.aiSettings);
    expect(row).toMatchObject({ adzunaAppId: "myapp", adzunaKeyLast4: "y123", braveKeyLast4: "y456" });
    expect(row.adzunaKeyCiphertext).not.toContain(FAKE_ADZUNA_KEY);
    const audit = await owner.select().from(t.auditLog).where(eq(t.auditLog.entity, "aiSettings"));
    expect(JSON.stringify(audit)).not.toContain(FAKE_ADZUNA_KEY);
    expect(JSON.stringify(audit)).not.toContain(FAKE_BRAVE_KEY);

    await db.update(t.aiSettings).set({ radarSources: ["adzuna", "brave"], useSearch: false });
    const desc = "Node.js TypeScript PostgreSQL. ".repeat(20);
    const ADZ = "https://93.184.216.34/adzuna/land/1";
    const web = fakeWeb((prompt) => answer(prompt.includes("Backend") ? { ...MATCH, score: 88 } : { ...MATCH, score: 30 }), {
      "https://api.adzuna.com/v1/api/jobs/es/search/1?*": () =>
        json(200, { results: [{ title: "Backend Engineer", redirect_url: ADZ, company: { display_name: "Initech" }, location: { display_name: "Madrid" }, created: "2026-10-06T00:00:00Z", description: "Extracto corto de la oferta para Node.js y PostgreSQL ".repeat(4) }] }),
      [ADZ]: () => html(`<h1>Backend Engineer</h1><p>${desc}</p>`),
      "https://api.search.brave.com/res/v1/web/search?*": () => json(200, { web: { results: [{ url: "https://jobs.ashbyhq.com/hooli/1", title: "Backend Engineer" }] } }),
      "https://api.ashbyhq.com/posting-api/job-board/hooli?includeCompensation=true": () =>
        json(200, { jobs: [{ title: "Backend Engineer, Platform", jobUrl: "https://jobs.ashbyhq.com/hooli/1", location: "Remote", publishedAt: "2026-10-05T00:00:00Z", isRemote: true, descriptionPlain: desc }] }),
    });
    const r = await runRadar(await aiContext(db, SECRET, { fetchImpl: web.fetchImpl, ...clock() }), "manual", ACTOR);
    const [run] = await db.select().from(t.jobRadarRuns);
    expect(r, JSON.stringify(run.log)).toMatchObject({ found: 2, evaluated: 2, added: 2 });
    const leads = await db.select().from(t.jobLeads);
    expect(leads.map((l) => l.source).sort()).toEqual(["adzuna", "brave"]);
    // La credencial de Brave viaja en la cabecera; la de Adzuna, a su API.
    expect(web.calls.some((c) => c.url.startsWith("https://api.adzuna.com/") && new URL(c.url).searchParams.get("app_key") === FAKE_ADZUNA_KEY)).toBe(true);
    // Adzuna solo da un extracto: la oferta se descargó para evaluarla con el texto completo.
    expect(web.calls.some((c) => c.url === ADZ)).toBe(true);

    await saveSourceKeys(db, ACTOR, { provider: "brave", clear: true, apiKey: "" }, SECRET);
    expect((await owner.select().from(t.aiSettings))[0].braveKeyCiphertext).toBeNull();
  });

  it("requires a CV", async () => {
    await db.delete(t.jobDocuments);
    await expect(runRadar(await aiContext(db, SECRET), "manual", ACTOR)).rejects.toBeInstanceOf(AiError);
  });
});

import { describe, expect, it, vi } from "vitest";
import { AiError, classifyFailure, createGemini, extractJson, type KeyStore, nextPacificMidnight, parseResponse } from "@/lib/ai/gemini";
import { extractJobPosting, extractMeta, fetchPage, htmlToText, isPrivateAddress, PageError } from "@/lib/ai/page";
import { canonicalUrl, isDue } from "@/lib/ai/radar";
import { braveFreshness, detectAts, discoverBoardsWithBrave, fromAdzuna, fromArbeitnow, fromAts, fromRemotive, locationMatches, queryTerms, titleMatches } from "@/lib/ai/sources";
import { S } from "@/lib/ai/schema";
import { decryptSecret, encryptSecret, last4 } from "@/lib/ai/secrets";
import { normalize, quoteInSource, verifyEvidence } from "@/lib/ai/verify";

const NOW = new Date("2026-10-07T10:00:00Z");
const SECRET = "x".repeat(40);

/* ----------------------------------------------------------------- cifrado */

describe("secrets", () => {
  it("round-trips and never stores the key in clear", () => {
    const enc = encryptSecret("AIzaSyExampleKey1234567890", SECRET);
    expect(enc).not.toContain("AIza");
    expect(decryptSecret(enc, SECRET)).toBe("AIzaSyExampleKey1234567890");
    expect(last4("AIzaSyExampleKey1234567890")).toBe("7890");
  });

  it("rejects tampering and a different server secret", () => {
    const enc = encryptSecret("secret-key-value-123456", SECRET);
    const [v, iv, tag, data] = enc.split(":");
    expect(decryptSecret([v, iv, tag, data.slice(0, -2) + "AA"].join(":"), SECRET)).toBeNull();
    expect(decryptSecret(enc, "y".repeat(40))).toBeNull();
    expect(decryptSecret("garbage", SECRET)).toBeNull();
  });
});

/* ------------------------------------------------- clasificación de errores */

const err = (code: number, message: string, details: unknown[] = []) => ({ error: { code, message, status: "X", details } });

describe("classifyFailure", () => {
  it("rate limit: rotates and waits the retryDelay the API asks for", () => {
    const f = classifyFailure(429, err(429, "Quota exceeded", [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "34s" }]) as never, NOW);
    expect(f).toMatchObject({ rotate: true, scope: "model" });
    expect(f.cooldownUntil!.getTime() - NOW.getTime()).toBe(34_000);
  });

  it("daily quota: waits until midnight Pacific time", () => {
    const f = classifyFailure(
      429,
      err(429, "Quota exceeded", [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }]) as never,
      NOW,
    );
    expect(f.cooldownUntil!.toISOString()).toBe("2026-10-08T07:00:00.000Z"); // 00:00 PDT
  });

  it("names the quota that was hit", () => {
    const f = classifyFailure(429, err(429, "You exceeded your current quota", [{ violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] }]) as never, NOW);
    expect(f.message).toContain("GenerateRequestsPerMinutePerProjectPerModel-FreeTier");
  });

  it("invalid key rotates with a long pause; bad requests and unknown models do not rotate", () => {
    expect(classifyFailure(400, err(400, "API key not valid. Please pass a valid API key.") as never, NOW)).toMatchObject({ rotate: true });
    expect(classifyFailure(403, err(403, "Permission denied") as never, NOW).rotate).toBe(true);
    expect(classifyFailure(400, err(400, "Invalid JSON payload") as never, NOW)).toMatchObject({ rotate: false, kind: "bad_request" });
    expect(classifyFailure(404, err(404, "models/foo is not found") as never, NOW)).toMatchObject({ rotate: false, kind: "model" });
    expect(classifyFailure(503, null, NOW)).toMatchObject({ rotate: true });
  });

  it("computes the Pacific midnight across DST", () => {
    expect(nextPacificMidnight(new Date("2026-12-01T12:00:00Z")).toISOString()).toBe("2026-12-02T08:00:00.000Z"); // PST
  });
});

/* -------------------------------------------------------- respuesta y JSON */

const ok = (text: string, extra: Record<string, unknown> = {}) => ({
  candidates: [{ content: { parts: [{ text: "pensando…", thought: true }, { text }] }, finishReason: "STOP", ...extra }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 3 },
});

describe("parseResponse / extractJson", () => {
  it("drops thoughts, dedupes grounding sources and sums tokens", () => {
    const r = parseResponse(
      ok("hola", {
        groundingMetadata: { webSearchQueries: ["q"], groundingChunks: [{ web: { uri: "https://a", title: "A" } }, { web: { uri: "https://a", title: "A" } }] },
        urlContextMetadata: { urlMetadata: [{ retrievedUrl: "https://x", urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" }] },
      }) as never,
    );
    expect(r.text).toBe("hola");
    expect(r.sources).toEqual([{ uri: "https://a", title: "A" }]);
    expect(r.urls).toEqual([{ url: "https://x", ok: true }]);
    expect(r.usage).toEqual({ input: 10, output: 8 });
  });

  it("reports blocked prompts", () => {
    expect(() => parseResponse({ promptFeedback: { blockReason: "SAFETY" } })).toThrow(AiError);
  });

  it("extracts JSON from fenced or noisy text", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Aquí tienes: {"a":[1,2]} ¡listo!')).toEqual({ a: [1, 2] });
    expect(extractJson("sin json")).toBeNull();
  });
});

describe("schema builder", () => {
  const spec = S.obj({ title: S.str(), score: S.int(0, 100) }, { tags: S.arr(S.str(), 2), kind: S.enum(["a", "b"]) });

  it("produces JSON Schema with only optional fields outside `required`", () => {
    expect(spec.json).toMatchObject({ type: "object", required: ["title", "score"], properties: { tags: { type: "array", maxItems: 2 } } });
  });

  it("validates tolerantly: clamps, drops bad items and bad optionals", () => {
    const r = spec.zod.parse({ title: " T ", score: 140, tags: ["x", 3, "y", "z"], kind: "nope" });
    expect(r).toEqual({ title: "T", score: 100, tags: ["x", "y"], kind: undefined });
    expect(spec.zod.safeParse({ score: 3 }).success).toBe(false);
  });
});

/* ---------------------------------------------------------------- rotación */

/** Reloj simulado: `sleep` avanza el tiempo en lugar de esperar de verdad. */
function fakeClock(start = NOW) {
  let t = start.getTime();
  const sleeps: number[] = [];
  return { now: () => new Date(t), sleep: async (ms: number) => void (sleeps.push(ms), (t += ms)), sleeps, advance: (ms: number) => (t += ms) };
}

function memoryStore(keys: { id: string; cooldownUntil?: Date | null }[]) {
  const state = keys.map((k) => ({ id: k.id, label: k.id, apiKey: `key-${k.id}`, cooldownUntil: k.cooldownUntil ?? null }));
  const models = new Map<string, { cooldownUntil: Date | null; lastRequestAt: Date | null }>();
  const slot = (id: string, model: string) => {
    const k = `${id}|${model}`;
    if (!models.has(k)) models.set(k, { cooldownUntil: null, lastRequestAt: null });
    return models.get(k)!;
  };
  const calls: string[] = [];
  const store: KeyStore = {
    keys: async () => state,
    modelStates: async (model) => new Map(state.map((k) => [k.id, slot(k.id, model)])),
    reserve: async (id, model, interval, now) => {
      const st = slot(id, model);
      const at = new Date(st.lastRequestAt ? Math.max(st.lastRequestAt.getTime() + interval, now.getTime()) : now.getTime());
      st.lastRequestAt = at;
      return at;
    },
    success: async (id, model) => {
      calls.push(`ok:${id}:${model}`);
      slot(id, model).cooldownUntil = null;
    },
    blockSearch: async (id, until) => {
      calls.push(`nosearch:${id}`);
      (state.find((k) => k.id === id) as { searchBlockedUntil?: Date | null }).searchBlockedUntil = until;
    },
    failure: async (id, model, _e, until) => {
      calls.push(`fail:${id}:${model}`);
      if (until.key !== undefined) state.find((k) => k.id === id)!.cooldownUntil = until.key;
      if (until.model !== undefined) slot(id, model).cooldownUntil = until.model;
    },
  };
  return { store, calls, state, slot };
}

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const keyOf = (call: unknown[]) => (call[1] as { headers: Record<string, string> }).headers["x-goog-api-key"];
const modelOf = (call: unknown[]) => /models\/([^:]+):/.exec(String(call[0]))![1];

describe("createGemini", () => {
  it("falls through to the next key on 429 and records both outcomes", async () => {
    const clock = fakeClock();
    const { store, calls, slot } = memoryStore([{ id: "k1" }, { id: "k2" }]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(429, err(429, "limit", [{ retryDelay: "40s" }])))
      .mockResolvedValueOnce(response(200, ok("respuesta")));
    const log = vi.fn().mockResolvedValue(undefined);
    const g = createGemini({ fetch, store, log, ...clock });
    const r = await g.generate({ feature: "t", model: "m", prompt: "p" });
    expect(r).toMatchObject({ text: "respuesta", keyId: "k2", attempts: 2, model: "m" });
    expect(calls).toEqual(["fail:k1:m", "ok:k2:m"]);
    expect(fetch.mock.calls.map(keyOf)).toEqual(["key-k1", "key-k2"]);
    // La espera es solo para ese modelo: k1 sigue disponible para otros.
    expect(slot("k1", "m").cooldownUntil!.getTime() - NOW.getTime()).toBe(40_000);
    expect(slot("k1", "other").cooldownUntil).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ status: "ok", attempts: 2, keyId: "k2" }));
  });

  it("waits for a short rate limit instead of failing", async () => {
    const clock = fakeClock();
    const { store } = memoryStore([{ id: "k1" }]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(429, err(429, "limit", [{ retryDelay: "8s" }])))
      .mockResolvedValueOnce(response(200, ok("ya")));
    const g = createGemini({ fetch, store, ...clock });
    const r = await g.generate({ feature: "t", model: "m", prompt: "p" });
    expect(r.text).toBe("ya");
    expect(clock.sleeps).toEqual([8_000]);
  });

  it("paces consecutive calls per key and model", async () => {
    const clock = fakeClock();
    const { store } = memoryStore([{ id: "k1" }]);
    const fetch = vi.fn().mockImplementation(async () => response(200, ok("ok")));
    const g = createGemini({ fetch, store, minIntervalMs: 12_000, ...clock });
    await g.generate({ feature: "t", model: "m", prompt: "1" });
    clock.advance(2_000);
    await g.generate({ feature: "t", model: "m", prompt: "2" });
    // Otro modelo no comparte ritmo.
    await g.generate({ feature: "t", model: "otro", prompt: "3" });
    expect(clock.sleeps).toEqual([10_000]);
  });

  it("prefers a key that is ready now over waiting for the first one", async () => {
    const clock = fakeClock();
    const { store, slot } = memoryStore([{ id: "k1" }, { id: "k2" }]);
    slot("k1", "m").cooldownUntil = new Date(NOW.getTime() + 30_000);
    const fetch = vi.fn().mockResolvedValue(response(200, ok("ok")));
    const g = createGemini({ fetch, store, ...clock });
    expect((await g.generate({ feature: "t", model: "m", prompt: "p" })).keyId).toBe("k2");
    expect(clock.sleeps).toEqual([]);
  });

  it("falls back to the light model when the main one is exhausted beyond the wait budget", async () => {
    const clock = fakeClock();
    const { store } = memoryStore([{ id: "k1" }]);
    const daily = err(429, "quota", [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }]);
    const fetch = vi.fn().mockResolvedValueOnce(response(429, daily)).mockResolvedValueOnce(response(200, ok("ligero")));
    const g = createGemini({ fetch, store, fallbacks: { main: "lite" }, ...clock });
    const r = await g.generate({ feature: "t", model: "main", prompt: "p" });
    expect(r).toMatchObject({ text: "ligero", model: "lite" });
    expect(fetch.mock.calls.map(modelOf)).toEqual(["main", "lite"]);
  });

  it("says when to retry when every key is out beyond the wait budget", async () => {
    const clock = fakeClock();
    const later = new Date(NOW.getTime() + 5 * 60_000);
    const { store, slot } = memoryStore([{ id: "k1" }]);
    slot("k1", "m").cooldownUntil = later;
    const fetch = vi.fn();
    const g = createGemini({ fetch, store, ...clock });
    await expect(g.generate({ feature: "t", model: "m", prompt: "p" })).rejects.toMatchObject({ kind: "exhausted", retryAt: later });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("parks a rejected key for every model", async () => {
    const clock = fakeClock();
    const { store, state } = memoryStore([{ id: "k1" }, { id: "k2" }]);
    const fetch = vi.fn().mockResolvedValueOnce(response(400, err(400, "API key not valid. Please pass a valid API key."))).mockResolvedValueOnce(response(200, ok("ok")));
    const g = createGemini({ fetch, store, ...clock });
    await g.generate({ feature: "t", model: "m", prompt: "p" });
    expect(state[0].cooldownUntil!.getTime() - NOW.getTime()).toBe(6 * 3_600_000);
  });

  it("drops Google Search when the plan does not include it, instead of parking the key", async () => {
    const clock = fakeClock();
    const { store, calls, slot, state } = memoryStore([{ id: "k1" }]);
    const billing = err(429, "You exceeded your current quota, please check your plan and billing details.");
    const fetch = vi.fn().mockResolvedValueOnce(response(429, billing)).mockResolvedValueOnce(response(200, ok("sin búsqueda")));
    const g = createGemini({ fetch, store, ...clock });
    const r = await g.generate({ feature: "t", model: "m", prompt: "p", search: true, urlContext: true });
    expect(r).toMatchObject({ text: "sin búsqueda", searchUsed: false });
    expect(JSON.parse(fetch.mock.calls[0][1].body).tools).toEqual([{ googleSearch: {} }, { urlContext: {} }]);
    expect(JSON.parse(fetch.mock.calls[1][1].body).tools).toEqual([{ urlContext: {} }]);
    expect(calls).toEqual(["nosearch:k1", "ok:k1:m"]);
    expect(slot("k1", "m").cooldownUntil).toBeNull();
    // Mientras dura la marca, ni se intenta con Search.
    const again = vi.fn().mockResolvedValue(response(200, ok("ok")));
    const g2 = createGemini({ fetch: again, store, ...clock });
    await g2.generate({ feature: "t", model: "m", prompt: "p", search: true });
    expect(JSON.parse(again.mock.calls[0][1].body).tools).toBeUndefined();
    expect((state[0] as { searchBlockedUntil?: Date }).searchBlockedUntil).toBeTruthy();
  });

  it("treats a 429 without Search too as a real rate limit", async () => {
    const clock = fakeClock();
    const { store, calls } = memoryStore([{ id: "k1" }]);
    const fetch = vi.fn().mockImplementation(async () => response(429, err(429, "quota", [{ retryDelay: "300s" }])));
    const g = createGemini({ fetch, store, ...clock });
    await expect(g.generate({ feature: "t", model: "m", prompt: "p", search: true })).rejects.toMatchObject({ kind: "exhausted" });
    expect(fetch).toHaveBeenCalledTimes(2); // con Search y sin Search
    expect(calls).toEqual(["fail:k1:m"]);
  });

  it("does not burn other keys on a bad request", async () => {
    const { store, calls } = memoryStore([{ id: "k1" }, { id: "k2" }]);
    const fetch = vi.fn().mockResolvedValue(response(400, err(400, "Invalid argument")));
    const g = createGemini({ fetch, store, ...fakeClock() });
    await expect(g.generate({ feature: "t", model: "m", prompt: "p" })).rejects.toMatchObject({ kind: "bad_request" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it("rotates on network errors and fails clearly when every key keeps failing", async () => {
    const { store } = memoryStore([{ id: "k1" }, { id: "k2" }]);
    const fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValue(response(503, err(503, "overloaded")));
    const g = createGemini({ fetch, store, ...fakeClock(), maxWaitMs: 10_000 });
    await expect(g.generate({ feature: "t", model: "m", prompt: "p" })).rejects.toThrow(/Ninguna clave/);
  });

  it("errors when there are no keys", async () => {
    const g = createGemini({ fetch: vi.fn(), store: memoryStore([]).store });
    await expect(g.generate({ feature: "t", model: "m", prompt: "p" })).rejects.toMatchObject({ kind: "no_keys" });
  });

  it("sends tools, system instruction and the structured-output schema", async () => {
    const { store } = memoryStore([{ id: "k1" }]);
    const fetch = vi.fn().mockResolvedValue(response(200, ok('{"title":"x","score":5}')));
    const g = createGemini({ fetch, store });
    const spec = S.obj({ title: S.str(), score: S.int(0, 10) });
    const { data } = await g.generateJson({ feature: "t", model: "gemini-x", prompt: "p", system: "s", search: true, urlContext: true }, spec);
    expect(data).toEqual({ title: "x", score: 5 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("/models/gemini-x:generateContent");
    const body = JSON.parse(init.body);
    expect(body.tools).toEqual([{ googleSearch: {} }, { urlContext: {} }]);
    expect(body.systemInstruction.parts[0].text).toBe("s");
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json", responseJsonSchema: spec.json });
  });

  it("falls back to research-then-structure when tools + JSON are not supported, and repairs invalid JSON", async () => {
    const { store } = memoryStore([{ id: "k1" }]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(400, err(400, "Tool use with a response mime type: 'application/json' is unsupported")))
      .mockResolvedValueOnce(response(200, ok("Notas: el título es Backend y la puntuación 7")))
      .mockResolvedValueOnce(response(200, ok('{"title":"Backend","score":7}')));
    const g = createGemini({ fetch, store });
    const { data } = await g.generateJson({ feature: "t", model: "m", prompt: "p", search: true }, S.obj({ title: S.str(), score: S.int(0, 10) }));
    expect(data).toEqual({ title: "Backend", score: 7 });
    expect(JSON.parse(fetch.mock.calls[1][1].body).generationConfig.responseMimeType).toBeUndefined();
    expect(JSON.parse(fetch.mock.calls[2][1].body).tools).toBeUndefined();
  });
});

/* ------------------------------------------------------------- verificación */

describe("quote verification", () => {
  const cv = "Diseñé y operé APIs REST en Node.js y TypeScript que atendían 2M peticiones/día. Migré esquemas de PostgreSQL sin parada.";

  it("accepts literal quotes ignoring case, accents and punctuation", () => {
    expect(quoteInSource("diseñe y opere APIs REST en Node.js y TypeScript", cv)).toBe(true);
    expect(quoteInSource("«Migré esquemas de PostgreSQL sin parada»", cv)).toBe(true);
    expect(normalize("Órbita, C++ y C#!")).toBe("orbita c++ y c#");
  });

  it("rejects invented or too-short evidence", () => {
    expect(quoteInSource("Lideré un equipo de 12 ingenieros en Kubernetes", cv)).toBe(false);
    expect(quoteInSource("Node.js", cv)).toBe(false);
    const v = verifyEvidence([{ point: "a", evidence: "Migré esquemas de PostgreSQL sin parada" }, { point: "b", evidence: "Gané un premio internacional de diseño" }], cv);
    expect(v.map((x) => x.verified)).toEqual([true, false]);
  });
});

/* -------------------------------------------------------- páginas y SSRF */

describe("page fetching", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "::ffff:127.0.0.1"])("%s is private", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });
  it.each(["8.8.8.8", "93.184.216.34", "2606:4700::1111"])("%s is public", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it("refuses internal targets, credentials and other schemes before connecting", async () => {
    const fetchImpl = vi.fn();
    await expect(fetchPage("http://127.0.0.1/admin", { fetchImpl })).rejects.toBeInstanceOf(PageError);
    await expect(fetchPage("http://localhost:3000/", { fetchImpl })).rejects.toBeInstanceOf(PageError);
    await expect(fetchPage("https://user:pw@93.184.216.34/", { fetchImpl })).rejects.toBeInstanceOf(PageError);
    await expect(fetchPage("file:///etc/passwd", { fetchImpl })).rejects.toBeInstanceOf(PageError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("re-checks every redirect hop (no redirect into the metadata service)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }));
    await expect(fetchPage("https://93.184.216.34/job", { fetchImpl })).rejects.toBeInstanceOf(PageError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("extracts a JobPosting from JSON-LD, including @graph and salary", () => {
    const html = `<html><head><title>Job</title><meta property="og:title" content="Backend &amp; APIs">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"JobPosting","title":"Senior Backend Engineer",
      "description":"&lt;p&gt;Build APIs&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Node.js&lt;/li&gt;&lt;/ul&gt;","datePosted":"2026-10-01T09:00:00Z","validThrough":"2026-11-01",
      "hiringOrganization":{"name":"Acme","sameAs":"https://acme.example"},"jobLocationType":"TELECOMMUTE",
      "jobLocation":{"address":{"addressLocality":"Lisboa","addressCountry":"PT"}},
      "baseSalary":{"currency":"EUR","value":{"minValue":60000,"maxValue":75000,"unitText":"YEAR"}}}]}</script></head><body></body></html>`;
    const p = extractJobPosting(html)!;
    expect(p).toMatchObject({ title: "Senior Backend Engineer", company: "Acme", datePosted: "2026-10-01", validThrough: "2026-11-01", remote: true, location: "Lisboa, PT" });
    expect(p.salary).toEqual({ min: 60000, max: 75000, currency: "EUR", unit: "YEAR" });
    expect(p.description).toContain("- Node.js");
    expect(extractMeta(html).title).toBe("Backend & APIs");
  });

  it("turns HTML into readable text without scripts", () => {
    expect(htmlToText("<script>alert(1)</script><h1>Rol</h1><ul><li>Uno</li><li>Dos</li></ul><p>Fin&nbsp;ya</p>")).toBe("Rol\n\n- Uno\n- Dos\nFin ya");
  });
});

/* -------------------------------------------------------------------- radar */

describe("radar helpers", () => {
  it("canonicalises URLs to detect duplicates", () => {
    expect(canonicalUrl("http://jobs.lever.co/acme/1/?utm_source=x&lever-origin=applied#apply")).toBe("https://jobs.lever.co/acme/1");
    expect(canonicalUrl("https://boards.greenhouse.io/acme/jobs/2?gh_jid=2")).toBe("https://boards.greenhouse.io/acme/jobs/2?gh_jid=2");
    expect(canonicalUrl("javascript:alert(1)")).toBeNull();
  });

  it("decides when the scheduled run is due, with slack for cron drift", () => {
    expect(isDue(null, 1, NOW)).toBe(true);
    expect(isDue(new Date(NOW.getTime() - 23 * 3_600_000), 1, NOW)).toBe(true);
    expect(isDue(new Date(NOW.getTime() - 20 * 3_600_000), 1, NOW)).toBe(false);
    expect(isDue(new Date(NOW.getTime() - 3 * 86_400_000), 7, NOW)).toBe(false);
  });
});

/* ------------------------------------------------------------ fuentes */

describe("radar sources", () => {
  it("detects public ATS boards from careers URLs", () => {
    expect(detectAts("https://boards.greenhouse.io/acme/jobs/1")).toEqual({ kind: "greenhouse", token: "acme" });
    expect(detectAts("https://jobs.eu.lever.co/globex")).toEqual({ kind: "lever", token: "globex", eu: true });
    expect(detectAts("https://jobs.ashbyhq.com/hooli/abc")).toEqual({ kind: "ashby", token: "hooli" });
    expect(detectAts("https://acme.com/careers")).toBeNull();
  });

  it("filters titles by the meaningful words of each search", () => {
    expect(queryTerms("Senior Backend Engineer Node.js remoto")).toEqual(["backend", "engineer", "node", "js"]);
    const q = ["Senior Backend Engineer Node.js remoto"];
    expect(titleMatches("Backend Engineer (Payments)", q)).toBe(true);
    expect(titleMatches("Software Engineer, Backend", q)).toBe(true);
    expect(titleMatches("Frontend Engineer", q)).toBe(false);
    expect(titleMatches("Platform Engineer", ["Platform"])).toBe(true);
  });

  it("filters locations, accepting remote when asked", () => {
    expect(locationMatches({ location: "Berlin, Germany", remote: null }, [])).toBe(true);
    expect(locationMatches({ location: "Lisboa", remote: null }, ["Lisboa", "Porto"])).toBe(true);
    expect(locationMatches({ location: "New York", remote: null }, ["Lisboa", "remoto"])).toBe(false);
    expect(locationMatches({ location: "Worldwide", remote: true }, ["remoto"])).toBe(true);
  });

  const reply = (body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));

  it("parses Greenhouse, Lever and Ashby", async () => {
    const gh = reply({ jobs: [{ id: 1, title: "Backend Engineer", absolute_url: "https://boards.greenhouse.io/acme/jobs/1", location: { name: "Remote" }, first_published: "2026-10-01T00:00:00Z", content: "&lt;p&gt;Node.js&lt;/p&gt;" }] });
    const [g] = await fromAts(gh, { kind: "greenhouse", token: "acme" }, "Acme");
    expect(g).toMatchObject({ title: "Backend Engineer", company: "Acme", postedAt: "2026-10-01", description: "Node.js", source: "greenhouse" });
    expect(String(gh.mock.calls[0][0])).toBe("https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true");

    const lv = reply([{ text: "Platform Engineer", hostedUrl: "https://jobs.lever.co/globex/1", categories: { location: "Lisboa" }, createdAt: 1_790_000_000_000, workplaceType: "remote", descriptionPlain: "Go" }]);
    const [l] = await fromAts(lv, { kind: "lever", token: "globex", eu: true }, "Globex");
    expect(l).toMatchObject({ title: "Platform Engineer", location: "Lisboa", remote: true, source: "lever" });
    expect(String(lv.mock.calls[0][0])).toBe("https://api.eu.lever.co/v0/postings/globex?mode=json");

    const ab = reply({ jobs: [{ title: "SRE", jobUrl: "https://jobs.ashbyhq.com/hooli/1", location: "Berlin", publishedAt: "2026-09-30T10:00:00Z", isRemote: false, descriptionPlain: "K8s" }, { title: "Hidden", jobUrl: "https://x", isListed: false }] });
    expect((await fromAts(ab, { kind: "ashby", token: "hooli" }, "Hooli")).map((j) => j.title)).toEqual(["SRE"]);
  });

  it("parses Remotive and Arbeitnow", async () => {
    const rm = reply({ jobs: [{ title: "Backend Dev", url: "https://remotive.com/remote-jobs/1", company_name: "Initech", candidate_required_location: "Europe", publication_date: "2026-10-02T08:00:00", description: "<p>APIs</p>" }] });
    expect((await fromRemotive(rm, "backend engineer"))[0]).toMatchObject({ company: "Initech", remote: true, description: "APIs", source: "remotive" });
    expect(String(rm.mock.calls[0][0])).toContain("search=backend%20engineer");
    const an = reply({ data: [{ title: "Backend Engineer", url: "https://www.arbeitnow.com/view/x", company_name: "Foo", location: "Berlin", remote: true, created_at: 1_790_000_000, description: "<p>x</p>" }] });
    expect((await fromArbeitnow(an))[0]).toMatchObject({ postedAt: "2026-09-21", remote: true, source: "arbeitnow" });
  });

  it("queries Adzuna with keywords, location and age, keeping only the snippet", async () => {
    const az = reply({ results: [{ title: "<strong>Backend</strong> Engineer", redirect_url: "https://www.adzuna.es/land/ad/1", company: { display_name: "Acme" }, location: { display_name: "Madrid" }, created: "2026-10-03T10:00:00Z", description: "Node.js…" }] });
    const [j] = await fromAdzuna(az, { appId: "id", appKey: "key", country: "es" }, "backend engineer", "Madrid", 14);
    expect(j).toMatchObject({ title: "Backend Engineer", company: "Acme", postedAt: "2026-10-03", source: "adzuna" });
    const url = new URL(String(az.mock.calls[0][0]));
    expect(url.pathname).toBe("/v1/api/jobs/es/search/1");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ app_id: "id", app_key: "key", what: "backend engineer", where: "Madrid", max_days_old: "14" });
  });

  it("discovers company boards with Brave restricted to public ATS sites", async () => {
    const br = reply({ web: { results: [
      { url: "https://boards.greenhouse.io/acme-corp/jobs/123", title: "Job Application for Backend Engineer at Acme" },
      { url: "https://boards.greenhouse.io/acme-corp/jobs/456", title: "Platform Engineer" },
      { url: "https://jobs.lever.co/globex/abc", title: "Globex - Backend" },
      { url: "https://example.com/blog", title: "Blog" },
    ] } });
    const r = await discoverBoardsWithBrave(br, "brave-key", "Senior Backend Engineer remoto", 7);
    expect(r.boards).toEqual([
      { kind: "greenhouse", token: "acme-corp", company: "Acme Corp" },
      { kind: "lever", token: "globex", company: "Globex" },
    ]);
    const [url, init] = br.mock.calls[0];
    const q = new URL(String(url)).searchParams;
    expect(q.get("q")).toContain("backend engineer (site:boards.greenhouse.io OR");
    expect(q.get("freshness")).toBe("pw");
    expect(init.headers["X-Subscription-Token"]).toBe("brave-key");
    expect(braveFreshness(1)).toBe("pd");
    expect(braveFreshness(30)).toBe("pm");
    const denied = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(discoverBoardsWithBrave(denied, "x", "q q", 7)).rejects.toThrow(/rechazada/);
  });
});


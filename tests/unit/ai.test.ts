import { describe, expect, it, vi } from "vitest";
import { AiError, classifyFailure, createGemini, extractJson, type KeyStore, nextPacificMidnight, parseResponse } from "@/lib/ai/gemini";
import { extractJobPosting, extractMeta, fetchPage, htmlToText, isPrivateAddress, PageError } from "@/lib/ai/page";
import { canonicalUrl, isDue } from "@/lib/ai/radar";
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
    expect(f.rotate).toBe(true);
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

function memoryStore(keys: { id: string; cooldownUntil?: Date | null }[]) {
  const state = keys.map((k) => ({ id: k.id, label: k.id, apiKey: `key-${k.id}`, cooldownUntil: k.cooldownUntil ?? null }));
  const calls: string[] = [];
  const store: KeyStore = {
    keys: async () => state,
    success: async (id) => void calls.push(`ok:${id}`),
    failure: async (id, _e, until) => {
      calls.push(`fail:${id}`);
      state.find((k) => k.id === id)!.cooldownUntil = until;
    },
  };
  return { store, calls, state };
}

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createGemini", () => {
  it("falls through to the next key on 429 and records both outcomes", async () => {
    const { store, calls, state } = memoryStore([{ id: "k1" }, { id: "k2" }]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(429, err(429, "limit", [{ retryDelay: "10s" }])))
      .mockResolvedValueOnce(response(200, ok("respuesta")));
    const log = vi.fn().mockResolvedValue(undefined);
    const g = createGemini({ fetch, store, log, now: () => NOW });
    const r = await g.generate({ feature: "t", model: "m", prompt: "p" });
    expect(r).toMatchObject({ text: "respuesta", keyId: "k2", attempts: 2 });
    expect(calls).toEqual(["fail:k1", "ok:k2"]);
    expect(state[0].cooldownUntil).not.toBeNull();
    expect(fetch.mock.calls[0][1].headers["x-goog-api-key"]).toBe("key-k1");
    expect(fetch.mock.calls[1][1].headers["x-goog-api-key"]).toBe("key-k2");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ status: "ok", attempts: 2, keyId: "k2" }));
  });

  it("skips keys still cooling down and says when to retry when none are left", async () => {
    const later = new Date(NOW.getTime() + 60_000);
    const { store } = memoryStore([{ id: "k1", cooldownUntil: later }]);
    const g = createGemini({ fetch: vi.fn(), store, now: () => NOW });
    await expect(g.generate({ feature: "t", model: "m", prompt: "p" })).rejects.toMatchObject({ kind: "exhausted", retryAt: later });
  });

  it("does not burn other keys on a bad request", async () => {
    const { store, calls } = memoryStore([{ id: "k1" }, { id: "k2" }]);
    const fetch = vi.fn().mockResolvedValue(response(400, err(400, "Invalid argument")));
    const g = createGemini({ fetch, store, now: () => NOW });
    await expect(g.generate({ feature: "t", model: "m", prompt: "p" })).rejects.toMatchObject({ kind: "bad_request" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it("rotates on network errors and fails clearly when every key fails", async () => {
    const { store } = memoryStore([{ id: "k1" }, { id: "k2" }]);
    const fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValueOnce(response(503, err(503, "overloaded")));
    const g = createGemini({ fetch, store, now: () => NOW });
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

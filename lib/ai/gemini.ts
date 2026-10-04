import { addDays, dateIn, zonedToUtc } from "@/lib/job-search/dates";
import type { JsonSchema, Spec } from "./schema";

/**
 * Cliente de Gemini (API REST generateContent, sin SDK) con rotación de claves.
 *
 * Antes de cada llamada se elige la clave que antes pueda atenderla con ese modelo: la que no
 * esté en espera y respete el ritmo configurado (peticiones por minuto por clave y modelo). Si
 * hay que esperar poco, se espera; si no, se prueba la siguiente clave y, al final, el modelo de
 * respaldo (Google limita por modelo, así que el ligero suele tener cuota cuando el principal no).
 *
 * Un 429 o un error del servidor dejan en espera esa clave solo para ese modelo; una clave
 * rechazada (401/403/no válida) queda en espera para todos. Un error de la petición (400) o un
 * modelo inexistente (404) no rotan: fallarían igual con cualquier clave.
 *
 * Importante: Google aplica los límites del plan gratuito por proyecto, no por clave. Para
 * sumar cuota, cada clave debe venir de un proyecto distinto (lo explica el panel).
 *
 * Todo se inyecta (fetch, almacén de claves, registro, reloj) para poder probarlo sin red.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export type AiKey = { id: string; label: string; apiKey: string; cooldownUntil: Date | null; searchBlockedUntil?: Date | null };
export type ModelState = { cooldownUntil: Date | null; lastRequestAt: Date | null };

export interface KeyStore {
  /** Claves activas y descifradas, en orden de prioridad (con su espera a nivel de clave). */
  keys(): Promise<AiKey[]>;
  /** Espera y última llamada de cada clave con un modelo concreto. */
  modelStates(model: string): Promise<Map<string, ModelState>>;
  /**
   * Reserva el siguiente hueco de la clave con ese modelo respetando el intervalo mínimo y
   * devuelve cuándo empieza. Es atómico en la base de datos: dos instancias no se pisan.
   */
  reserve(keyId: string, model: string, minIntervalMs: number, now: Date): Promise<Date>;
  success(keyId: string, model: string, at: Date): Promise<void>;
  failure(keyId: string, model: string, error: string, until: { key?: Date | null; model?: Date | null }, at: Date): Promise<void>;
  /** La clave no tiene Google Search en su plan: hasta `until`, sus llamadas van sin él. */
  blockSearch(keyId: string, until: Date): Promise<void>;
}

export type RunEntry = {
  feature: string;
  model: string;
  keyId: string | null;
  status: "ok" | "error";
  attempts: number;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
};

export type GenerateRequest = {
  /** Nombre de la función que llama, para el registro de uso. */
  feature: string;
  model: string;
  system?: string;
  prompt: string;
  /** Grounding con Google Search. */
  search?: boolean;
  /** Lectura de las URLs que aparecen en el prompt. */
  urlContext?: boolean;
  /** Salida estructurada (JSON Schema). */
  schema?: JsonSchema;
  temperature?: number;
  maxOutputTokens?: number;
  /** Cuánto se puede esperar como mucho a que una clave esté disponible (por defecto, 60 s). */
  maxWaitMs?: number;
  /** No pasar al modelo de respaldo aunque el pedido esté agotado. */
  noFallback?: boolean;
};

export type Source = { uri: string; title: string | null };

export type GenerateResult = {
  text: string;
  /** Fuentes reales de Google Search (metadatos de grounding, no lo que diga el texto). */
  sources: Source[];
  searchQueries: string[];
  /** URLs leídas con url_context y si se pudieron recuperar. */
  urls: { url: string; ok: boolean }[];
  usage: { input: number | null; output: number | null };
  keyId: string;
  model: string;
  attempts: number;
  /** Si la respuesta usó Google Search (false si se pidió pero el plan no lo incluye). */
  searchUsed: boolean;
};

export type AiErrorKind = "disabled" | "no_keys" | "exhausted" | "bad_request" | "model" | "blocked" | "invalid_output";

export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
    public retryAt: Date | null = null,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/* ------------------------------------------------------- clasificación */

type ErrorBody = { error?: { code?: number; message?: string; status?: string; details?: Record<string, unknown>[] } };

export type Failure = {
  /** Probar con la siguiente clave. */
  rotate: boolean;
  /** Hasta cuándo no usar esta clave (null = disponible ya). */
  cooldownUntil: Date | null;
  message: string;
  kind: AiErrorKind;
  /** "key": la clave no sirve para nada (rechazada); "model": solo para este modelo. */
  scope: "key" | "model";
};

/** "34s" / "1.5s" → milisegundos. */
function parseDelay(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(v.trim());
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
}

/** Próxima medianoche del Pacífico: cuando Google reinicia las cuotas diarias. */
export function nextPacificMidnight(now: Date): Date {
  const today = dateIn(now, "America/Los_Angeles");
  return zonedToUtc(`${addDays(today, 1)}T00:00`, "America/Los_Angeles") ?? new Date(now.getTime() + 86_400_000);
}

export function classifyFailure(status: number, body: ErrorBody | null, now: Date): Failure {
  const err = body?.error;
  const details = err?.details ?? [];
  const retryDelay = details.map((d) => parseDelay(d.retryDelay)).find((d) => d !== null) ?? null;
  const quotaIds = details.flatMap((d) => (Array.isArray(d.violations) ? d.violations : [])).map((v) => String((v as { quotaId?: string }).quotaId ?? ""));
  // El texto de Google es genérico; el identificador de la cuota dice cuál saltó (por minuto, por día, de qué modelo).
  const message = `${err?.message?.slice(0, 300) ?? `HTTP ${status}`}${quotaIds.filter(Boolean).length ? ` [${quotaIds.filter(Boolean).join(", ")}]` : ""}`;
  const keyInvalid = /API_KEY_INVALID|API key not valid|API key expired/i.test(message) || details.some((d) => d.reason === "API_KEY_INVALID");

  if (status === 429) {
    // Cuota diaria agotada: la clave no vuelve a servir hasta el reinicio del día en el Pacífico.
    if (quotaIds.some((q) => /PerDay/i.test(q))) {
      return { rotate: true, cooldownUntil: nextPacificMidnight(now), message: `Cuota diaria agotada (${message})`, kind: "exhausted", scope: "model" };
    }
    return { rotate: true, cooldownUntil: new Date(now.getTime() + Math.max(retryDelay ?? 60_000, 5_000)), message: `Límite alcanzado (${message})`, kind: "exhausted", scope: "model" };
  }
  if (status === 401 || status === 403 || keyInvalid) {
    return { rotate: true, cooldownUntil: new Date(now.getTime() + 6 * 3_600_000), message: `Clave rechazada (${message})`, kind: "exhausted", scope: "key" };
  }
  if (status === 404) return { rotate: false, cooldownUntil: null, message: `Modelo no disponible: ${message}`, kind: "model", scope: "model" };
  if (status === 400) return { rotate: false, cooldownUntil: null, message, kind: "bad_request", scope: "model" };
  // 5xx, 0 (red) y cualquier otro: problema transitorio del servicio.
  return { rotate: true, cooldownUntil: new Date(now.getTime() + 20_000), message: `Servicio no disponible (${message})`, kind: "exhausted", scope: "model" };
}

/* ----------------------------------------------------------- respuesta */

type Part = { text?: string; thought?: boolean };
type Candidate = {
  content?: { parts?: Part[] };
  finishReason?: string;
  groundingMetadata?: { webSearchQueries?: string[]; groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  urlContextMetadata?: { urlMetadata?: { retrievedUrl?: string; urlRetrievalStatus?: string }[] };
};
type ResponseBody = {
  candidates?: Candidate[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};

export function parseResponse(body: ResponseBody) {
  const c = body.candidates?.[0];
  if (!c) {
    throw new AiError("blocked", body.promptFeedback?.blockReason ? `Gemini bloqueó la petición (${body.promptFeedback.blockReason})` : "Gemini no devolvió respuesta");
  }
  const text = (c.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
  if (!text) {
    throw new AiError(c.finishReason === "SAFETY" ? "blocked" : "invalid_output", `Respuesta vacía de Gemini (${c.finishReason ?? "sin motivo"})`);
  }
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const g of c.groundingMetadata?.groundingChunks ?? []) {
    const uri = g.web?.uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({ uri, title: g.web?.title ?? null });
    }
  }
  const u = body.usageMetadata;
  return {
    text,
    sources,
    searchQueries: c.groundingMetadata?.webSearchQueries ?? [],
    urls: (c.urlContextMetadata?.urlMetadata ?? []).map((m) => ({ url: m.retrievedUrl ?? "", ok: m.urlRetrievalStatus === "URL_RETRIEVAL_STATUS_SUCCESS" })),
    usage: { input: u?.promptTokenCount ?? null, output: u ? (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) : null },
    truncated: c.finishReason === "MAX_TOKENS",
  };
}

/** Saca el JSON de un texto (con o sin bloque ```json) y lo parsea. null si no hay JSON válido. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced ? fenced[1] : text).trim();
  const starts = [candidate.indexOf("{"), candidate.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------- cliente */

export type GeminiDeps = {
  fetch: typeof fetch;
  store: KeyStore;
  log?: (entry: RunEntry) => Promise<void>;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  /** Intervalo mínimo entre llamadas de una misma clave con un mismo modelo (0 = sin ritmo). */
  minIntervalMs?: number;
  /** Modelo de respaldo para cada modelo (p. ej., principal → ligero). */
  fallbacks?: Record<string, string>;
  /** Espera máxima por defecto si la petición no indica otra. */
  maxWaitMs?: number;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createGemini({
  fetch: doFetch,
  store,
  log,
  now = () => new Date(),
  sleep = realSleep,
  timeoutMs = 90_000,
  minIntervalMs = 0,
  fallbacks = {},
  maxWaitMs: defaultMaxWait = 60_000,
}: GeminiDeps) {
  async function generate(req: GenerateRequest): Promise<GenerateResult> {
    const started = Date.now();
    const deadline = now().getTime() + (req.maxWaitMs ?? defaultMaxWait);
    const fallback = req.noFallback ? undefined : fallbacks[req.model];
    const models = fallback && fallback !== req.model ? [req.model, fallback] : [req.model];

    if (!(await store.keys()).length) throw new AiError("no_keys", "No hay ninguna clave de Gemini activa. Añádela en Ajustes → IA.");

    const errors: string[] = [];
    let attempts = 0;
    let lastKind: AiErrorKind = "exhausted";
    let retryAt: number | null = null;
    const noteRetry = (ms: number) => (retryAt = retryAt === null ? ms : Math.min(retryAt, ms));
    const finish = (model: string, entry: Omit<RunEntry, "feature" | "model" | "attempts" | "latencyMs">) =>
      log?.({ feature: req.feature, model, attempts, latencyMs: Date.now() - started, ...entry }).catch(() => {});

    for (const model of models) {
      const bodyFor = (withSearch: boolean) =>
        JSON.stringify({
          contents: [{ role: "user", parts: [{ text: req.prompt }] }],
          ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
          ...(withSearch || req.urlContext ? { tools: [...(withSearch ? [{ googleSearch: {} }] : []), ...(req.urlContext ? [{ urlContext: {} }] : [])] } : {}),
          generationConfig: {
            temperature: req.temperature ?? 0.3,
            ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
            ...(req.schema ? { responseMimeType: "application/json", responseJsonSchema: req.schema } : {}),
          },
        });
      const call = async (key: AiKey, withSearch: boolean) => {
        attempts++;
        try {
          const res = await doFetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key.apiKey },
            body: bodyFor(withSearch),
            signal: AbortSignal.timeout(timeoutMs),
            cache: "no-store",
          });
          return { status: res.status, json: (await res.json().catch(() => null)) as unknown };
        } catch (err) {
          errors.push(`${key.label}: ${err instanceof Error ? err.message : "error de red"}`);
          return { status: 0, json: null as unknown };
        }
      };

      // Varias vueltas por modelo: tras un 429 corto la misma clave puede volver a estar lista.
      for (let round = 0; round < 12; round++) {
        const t = now().getTime();
        const all = await store.keys();
        const usable = all.filter((k) => !k.cooldownUntil || k.cooldownUntil.getTime() <= t);
        for (const k of all) if (k.cooldownUntil && k.cooldownUntil.getTime() > t) noteRetry(k.cooldownUntil.getTime());
        if (!usable.length) break;

        const states = await store.modelStates(model);
        const ranked = usable
          .map((key, order) => {
            const st = states.get(key.id);
            const ready = Math.max(t, st?.cooldownUntil?.getTime() ?? 0, minIntervalMs && st?.lastRequestAt ? st.lastRequestAt.getTime() + minIntervalMs : 0);
            return { key, ready, order };
          })
          .sort((a, b) => a.ready - b.ready || a.order - b.order);
        const best = ranked[0];
        if (best.ready > deadline) {
          noteRetry(best.ready);
          break;
        }
        const slot = minIntervalMs ? (await store.reserve(best.key.id, model, minIntervalMs, now())).getTime() : t;
        const startAt = Math.max(best.ready, slot);
        if (startAt > deadline) {
          noteRetry(startAt);
          break;
        }
        const wait = startAt - now().getTime();
        if (wait > 0) await sleep(wait);

        const key = best.key;
        const withSearch = !!req.search && !(key.searchBlockedUntil && key.searchBlockedUntil.getTime() > now().getTime());
        let { status, json } = await call(key, withSearch);
        let searchUsed = withSearch;
        // El plan gratuito de Gemini 3 no incluye Google Search y responde 429: se repite sin él y,
        // si así funciona, la clave deja de pedirlo durante un día en lugar de quedar en espera.
        if (status === 429 && withSearch) {
          const retry = await call(key, false);
          if (retry.status >= 200 && retry.status < 300) {
            await store.blockSearch(key.id, new Date(now().getTime() + 24 * 3_600_000));
            ({ status, json } = retry);
            searchUsed = false;
          } else if (retry.status) {
            ({ status, json } = retry);
          }
        }

        if (status >= 200 && status < 300) {
          await store.success(best.key.id, model, now());
          try {
            const parsed = parseResponse(json as ResponseBody);
            await finish(model, { keyId: best.key.id, status: "ok", inputTokens: parsed.usage.input, outputTokens: parsed.usage.output, error: null });
            return { ...parsed, keyId: best.key.id, model, attempts, searchUsed };
          } catch (err) {
            // Respuesta bloqueada o vacía: el problema es el contenido, no la clave.
            await finish(model, { keyId: best.key.id, status: "error", inputTokens: null, outputTokens: null, error: (err as Error).message });
            throw err;
          }
        }

        const failure = classifyFailure(status, json as ErrorBody | null, now());
        lastKind = failure.kind;
        if (!failure.rotate) {
          await finish(model, { keyId: best.key.id, status: "error", inputTokens: null, outputTokens: null, error: failure.message });
          throw new AiError(failure.kind, failure.message);
        }
        if (status) errors.push(`${best.key.label} (${model}): ${failure.message}`);
        await store.failure(best.key.id, model, failure.message, failure.scope === "key" ? { key: failure.cooldownUntil } : { model: failure.cooldownUntil }, now());
      }
    }

    const until = retryAt === null ? null : new Date(retryAt);
    const message = (errors.length ? `Ninguna clave pudo atender la petición. ${errors.slice(-4).join(" · ")}` : "Todas las claves están en espera por límite de uso.").slice(0, 1000);
    await finish(req.model, { keyId: null, status: "error", inputTokens: null, outputTokens: null, error: message });
    throw new AiError(lastKind === "exhausted" || !errors.length ? "exhausted" : lastKind, message, until);
  }

  /**
   * Respuesta JSON validada. Con herramientas (Search/URLs) se pide la salida estructurada en
   * la misma llamada; si el modelo no admite esa combinación, se hace en dos pasos: primero se
   * investiga en texto libre y después se estructura sin herramientas.
   */
  async function generateJson<T>(req: Omit<GenerateRequest, "schema">, spec: Spec<T>): Promise<{ data: T; result: GenerateResult }> {
    const validate = (text: string) => {
      const raw = extractJson(text);
      const r = raw === null ? null : spec.zod.safeParse(raw);
      return r?.success ? r.data : null;
    };
    const restructure = async (text: string, base: GenerateResult) => {
      const repaired = await generate({
        feature: `${req.feature}:estructurar`,
        model: req.model,
        system: "Conviertes notas a JSON. No añades información que no esté en las notas.",
        prompt: `Convierte estas notas al esquema JSON indicado. Si un dato no aparece, omítelo.\n\nNOTAS:\n${text}`,
        schema: spec.json,
        temperature: 0,
      });
      const data = validate(repaired.text);
      if (data === null) throw new AiError("invalid_output", "Gemini devolvió un JSON que no cumple el esquema.");
      return { data, result: { ...base, usage: repaired.usage, attempts: base.attempts + repaired.attempts } };
    };

    let result: GenerateResult;
    try {
      result = await generate({ ...req, schema: spec.json });
    } catch (err) {
      const unsupported = err instanceof AiError && err.kind === "bad_request" && (req.search || req.urlContext);
      if (!unsupported) throw err;
      const notes = await generate({ ...req, prompt: `${req.prompt}\n\nResponde con toda la información encontrada; después se convertirá a JSON.` });
      return restructure(notes.text, notes);
    }
    const data = validate(result.text);
    if (data !== null) return { data, result };
    return restructure(result.text, result);
  }

  return { generate, generateJson };
}

export type Gemini = ReturnType<typeof createGemini>;

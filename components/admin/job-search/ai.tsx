"use client";

import { useActionState, useState } from "react";
import type { AiState } from "@/lib/ai/actions";

/**
 * Piezas de cliente para las acciones de IA: un botón que muestra que Gemini está trabajando
 * (las llamadas tardan segundos) y formularios que enseñan el borrador devuelto sin guardarlo.
 */

type Action<T = unknown> = (state: AiState<T>, fd: FormData) => Promise<AiState<T>>;
const idle = { status: "idle" } as const;

function Status({ state }: { state: AiState }) {
  if (state.status === "idle") return null;
  return (
    <p role="status" aria-live="polite" className={`text-xs ${state.status === "error" ? "text-red-500" : "text-slate-700"}`}>
      {state.message}
    </p>
  );
}

/** Marca discreta de "hecho con IA": un punto verde, sin efectos. */
export function AiMark() {
  return <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-primary" />;
}

export function AiButton({
  action,
  hidden,
  label,
  pendingLabel = "Pensando con Gemini…",
  variant = "ghost",
  disabled,
}: {
  action: Action;
  hidden: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "ghost";
  disabled?: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" disabled={pending || !!disabled} title={disabled} className={`${variant === "primary" ? "btn" : "btn-ghost"} gap-2`}>
        <AiMark />
        {pending ? pendingLabel : label}
      </button>
      <Status state={state} />
    </form>
  );
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Copiado" : "Copiar"}
    </button>
  );
}

const field = "field py-1.5";

/** Redactor de mensajes: el borrador se muestra para copiar o abrir en el correo; no se guarda. */
export function DraftMessage({
  action,
  kinds,
  contactId,
  opportunityId,
  email,
  defaultKind,
}: {
  action: Action<{ subject?: string; body: string }>;
  kinds: Record<string, string>;
  contactId?: string;
  opportunityId?: string;
  email?: string | null;
  defaultKind?: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const draft = state.status === "success" ? state.data : undefined;
  const [channel, setChannel] = useState<"linkedin" | "email">("linkedin");
  return (
    <div className="space-y-3">
      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        {contactId ? <input type="hidden" name="contactId" value={contactId} /> : null}
        {opportunityId ? <input type="hidden" name="opportunityId" value={opportunityId} /> : null}
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs text-slate-600">Qué mensaje</span>
          <select name="kind" defaultValue={defaultKind} className={field}>
            {Object.entries(kinds).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-600">Canal</span>
          <select name="channel" value={channel} onChange={(e) => setChannel(e.target.value as "linkedin" | "email")} className={field}>
            <option value="linkedin">LinkedIn</option>
            <option value="email">Correo</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-600">Idioma</span>
          <select name="language" defaultValue="es" className={field}>
            <option value="es">Castellano</option>
            <option value="en">Inglés</option>
          </select>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs text-slate-600">Indicaciones (opcional)</span>
          <input name="notes" className={field} placeholder="Nos conocimos en…, menciona…" />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={pending} className="btn gap-2">
            <AiMark />
            {pending ? "Redactando…" : "Redactar"}
          </button>
          {state.status === "error" ? <Status state={state} /> : null}
        </div>
      </form>
      {draft ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          {draft.subject ? <p className="text-sm font-medium text-carbon">Asunto: {draft.subject}</p> : null}
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{draft.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Copy text={draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body} />
            {email && channel === "email" ? (
              <a className="btn-ghost" href={`mailto:${encodeURI(email)}?${new URLSearchParams({ subject: draft.subject ?? "", body: draft.body }).toString().replace(/\+/g, "%20")}`}>
                Abrir en el correo
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type Feedback = { score: number; feedback: string; strengths?: string[]; improve?: string[]; improvedOutline?: string };

/** Ensayo de respuesta: escribes cómo contestarías y la IA lo evalúa sin añadir hechos. */
export function Rehearsal({ action, interviewId, questions }: { action: Action<Feedback>; interviewId: string; questions: string[] }) {
  const [state, formAction, pending] = useActionState(action, idle);
  const fb = state.status === "success" ? state.data : undefined;
  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="interviewId" value={interviewId} />
        <label className="block space-y-1">
          <span className="text-xs text-slate-600">Pregunta</span>
          <input name="question" list="rehearsal-questions" className={field} placeholder="Háblame de un proyecto difícil…" />
          <datalist id="rehearsal-questions">
            {questions.map((q) => (
              <option key={q} value={q} />
            ))}
          </datalist>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-600">Tu respuesta, tal como la dirías</span>
          <textarea name="answer" rows={6} className="field" />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn gap-2">
            <AiMark />
            {pending ? "Evaluando…" : "Evaluar respuesta"}
          </button>
          {state.status === "error" ? <Status state={state} /> : null}
        </div>
      </form>
      {fb ? (
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-medium text-carbon">
            {fb.score}/10 · <span className="font-normal text-slate-800">{fb.feedback}</span>
          </p>
          {fb.strengths?.length ? <p className="text-slate-700">Bien: {fb.strengths.join(" · ")}</p> : null}
          {fb.improve?.length ? <p className="text-slate-700">Mejorar: {fb.improve.join(" · ")}</p> : null}
          {fb.improvedOutline ? <p className="whitespace-pre-wrap text-slate-800">{fb.improvedOutline}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

type Coach = { summary: string; working?: string[]; change?: string[]; focus?: string[] };

export function CoachPanel({ action, weekStart }: { action: Action<Coach>; weekStart: string }) {
  const [state, formAction, pending] = useActionState(action, idle);
  const c = state.status === "success" ? state.data : undefined;
  return (
    <div className="space-y-3">
      <form action={formAction} className="flex items-center gap-3">
        <input type="hidden" name="weekStart" value={weekStart} />
        <button type="submit" disabled={pending} className="btn-ghost gap-2">
          <AiMark />
          {pending ? "Analizando la semana…" : "Pedir análisis al coach"}
        </button>
        {state.status === "error" ? <Status state={state} /> : null}
      </form>
      {c ? (
        <div className="space-y-2 rounded-md border border-slate-200 bg-white p-4 text-sm">
          <p className="text-slate-800">{c.summary}</p>
          {c.working?.length ? <p className="text-slate-700">Funciona: {c.working.join(" · ")}</p> : null}
          {c.change?.length ? <p className="text-slate-700">Cambiar: {c.change.join(" · ")}</p> : null}
          {c.focus?.length ? (
            <ol className="list-decimal space-y-1 pl-5 text-slate-800">
              {c.focus.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

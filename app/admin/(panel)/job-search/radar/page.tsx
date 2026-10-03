import Link from "next/link";
import { ActionButton } from "@/components/admin/job-search/ActionButton";
import { AiButton } from "@/components/admin/job-search/ai";
import { AiOff, Badge, Empty, PageHeader, Section } from "@/components/admin/job-search/ui";
import { leadAction, runRadarAction } from "@/lib/ai/actions";
import { listLeads, listRadarRuns } from "@/lib/ai/admin";
import type { VerifiedMatch } from "@/lib/ai/features";
import { getAiSettings } from "@/lib/ai/store";
import { env } from "@/lib/env";
import { formatDateTime, formatDay } from "@/lib/job-search/dates";
import { db, getSnapshot } from "@/lib/job-search/server";

export const metadata = { title: "Radar" };
export const maxDuration = 300;

const STATUS: Record<string, string> = {
  new: "Pendiente de evaluar",
  added: "En la bandeja",
  below_threshold: "Por debajo del umbral",
  dismissed: "Descartada",
  unreachable: "Enlace no verificable",
};

type Lead = Awaited<ReturnType<typeof listLeads>>[number];

function LeadRow({ lead, tz, min }: { lead: Lead; tz: string; min: number }) {
  const match = lead.match as (Partial<VerifiedMatch> & { error?: string }) | null;
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <a href={lead.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-carbon hover:underline">
          {lead.title}
        </a>
        <p className="text-xs text-slate-600">
          {[lead.companyName, lead.location, lead.postedAt ? `publicada ${formatDay(lead.postedAt)}` : null].filter(Boolean).join(" · ")}
        </p>
        {match?.verdict ? <p className="mt-1 text-sm text-slate-700">{match.verdict}</p> : null}
        {match?.gaps?.length ? <p className="mt-0.5 text-xs text-slate-500">Carencias: {match.gaps.map((g) => g.point).join(" · ")}</p> : null}
        {match?.error ? <p className="mt-0.5 text-xs text-slate-500">{match.error}</p> : null}
        <p className="mt-1 text-[0.7rem] text-slate-500">
          {STATUS[lead.status]} · encontrada {formatDateTime(lead.createdAt, tz)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {lead.matchScore !== null ? (
          <span className={`font-mono text-2xl ${lead.matchScore >= min ? "text-carbon" : "text-slate-500"}`}>{lead.matchScore}%</span>
        ) : null}
        <div className="flex gap-1">
          {lead.opportunityId ? (
            <Link href={`/admin/job-search/opportunities/${lead.opportunityId}`} className="btn-ghost">
              Abrir
            </Link>
          ) : lead.status !== "dismissed" ? (
            <ActionButton action={leadAction} hidden={{ id: lead.id, op: "add" }} label="Añadir a la bandeja" />
          ) : null}
          {!lead.opportunityId && lead.status !== "dismissed" ? <ActionButton action={leadAction} hidden={{ id: lead.id, op: "dismiss" }} label="Descartar" variant="link" /> : null}
        </div>
      </div>
    </li>
  );
}

export default async function RadarPage() {
  const [ai, leads, runs, s] = await Promise.all([getAiSettings(db), listLeads(db), listRadarRuns(db, 8), getSnapshot()]);
  const tz = s.goal.timezone;
  const cronReady = !!env().CRON_SECRET;
  const groups = [
    ["Añadidas a la bandeja", leads.filter((l) => l.status === "added")],
    ["Pendientes de evaluar", leads.filter((l) => l.status === "new")],
    [`Por debajo del ${ai.radarMinMatch} %`, leads.filter((l) => l.status === "below_threshold")],
    ["Descartadas o sin verificar", leads.filter((l) => l.status === "dismissed" || l.status === "unreachable")],
  ] as const;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Radar"
        count={leads.length}
        description={`Gemini busca ofertas recientes con Google Search, comprueba que el enlace existe, mide el encaje con tu CV y lleva a la bandeja las que llegan al ${ai.radarMinMatch} %.`}
        action={
          <AiButton
            action={runRadarAction}
            hidden={{}}
            label="Buscar ahora"
            pendingLabel="Buscando y evaluando… (puede tardar unos minutos)"
            variant="primary"
            disabled={!ai.enabled ? "Activa la IA en Ajustes → Inteligencia artificial" : !ai.useSearch ? "Activa el acceso web en Ajustes → IA" : undefined}
          />
        }
      />
      {!ai.enabled ? <AiOff what="El radar usa Gemini" /> : null}
      <p className="text-sm text-slate-600">
        {ai.radarEnabled
          ? cronReady
            ? `Ejecución automática cada ${ai.radarFrequencyDays === 1 ? "día" : `${ai.radarFrequencyDays} días`}, hasta ${ai.radarMaxPerRun} evaluaciones por pasada.`
            : "El radar está activado, pero la ejecución automática necesita la variable CRON_SECRET en Vercel. Mientras tanto, usa «Buscar ahora»."
          : "La ejecución automática está desactivada."}{" "}
        <Link href="/admin/job-search/settings/ai" className="link">
          Configurar el radar
        </Link>
      </p>

      {leads.length ? (
        groups.map(([title, list]) =>
          list.length ? (
            <Section key={title} title={`${title} · ${list.length}`}>
              <ul className="panel divide-y divide-slate-200">
                {list.map((l) => (
                  <LeadRow key={l.id} lead={l} tz={tz} min={ai.radarMinMatch} />
                ))}
              </ul>
            </Section>
          ) : null,
        )
      ) : (
        <Empty>El radar aún no ha encontrado nada. Revisa las búsquedas en Ajustes y pulsa «Buscar ahora».</Empty>
      )}

      {runs.length ? (
        <Section title="Ejecuciones">
          <ul className="panel divide-y divide-slate-200">
            {runs.map((r) => (
              <li key={r.id} className="px-4 py-2.5">
                <details>
                  <summary className="cursor-pointer text-sm text-carbon">
                    {formatDateTime(r.startedAt, tz)} · {r.trigger === "cron" ? "automática" : "manual"} ·{" "}
                    <Badge tone={r.status === "error" ? "dark" : "default"}>{{ running: "en curso", ok: "completa", partial: "parcial", error: "error" }[r.status] ?? r.status}</Badge>{" "}
                    <span className="text-xs text-slate-600">
                      {r.found} nuevas · {r.evaluated} evaluadas · {r.added} añadidas
                    </span>
                  </summary>
                  {r.error ? <p className="mt-2 text-xs text-slate-700">{r.error}</p> : null}
                  <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                    {(r.log as { at: string; msg: string }[]).map((e, i) => (
                      <li key={i}>{e.msg}</li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

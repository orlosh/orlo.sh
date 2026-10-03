import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { Select, TextArea, TextField } from "@/components/admin/fields";
import { ActionButton } from "@/components/admin/job-search/ActionButton";
import { Notes, TaskFields, TaskList, Timeline } from "@/components/admin/job-search/lists";
import { AiButton, DraftMessage } from "@/components/admin/job-search/ai";
import { AiAnalysisCard, AiMatchCard } from "@/components/admin/job-search/AiResults";
import { OpportunityForm } from "@/components/admin/job-search/OpportunityForm";
import { StatusSelect } from "@/components/admin/job-search/StatusSelect";
import { Badge, Empty, Muted, PlainText, PriorityTag, Section, Table, Tabs, td } from "@/components/admin/job-search/ui";
import {
  changeStatusAction,
  deleteOpportunityAction,
  linkContactAction,
  linkDocumentAction,
  requestReferralAction,
  saveContactAction,
  saveInterviewAction,
  unlinkContactAction,
  unlinkDocumentAction,
  updateReferralAction,
} from "@/lib/job-search/actions";
import { eq } from "drizzle-orm";
import { jobDocuments } from "@/db/schema";
import { coverLetterAction, draftMessageAction, matchAction, reanalyzeAction } from "@/lib/ai/actions";
import { MESSAGE_KINDS, type VerifiedMatch } from "@/lib/ai/features";
import type { JobExtraction } from "@/lib/ai/schemas";
import { getAiSettings } from "@/lib/ai/store";
import { googleCalendarUrl, mailto } from "@/lib/job-search/calendar";
import { daysBetween, formatDateTime, formatDay, relativeDay } from "@/lib/job-search/dates";
import { analyzeOpportunity } from "@/lib/job-search/engine";
import type { OpportunityStatus } from "@/lib/job-search/enums";
import { matchCv } from "@/lib/job-search/jd";
import {
  CONTACT_KIND_LABEL,
  DOCUMENT_KIND_LABEL,
  INTERVIEW_KIND_LABEL,
  INTERVIEW_OUTCOME_LABEL,
  OPTIONS,
  OUTCOME_LABEL,
  REFERRAL_STATUS_LABEL,
  SENIORITY_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  WORKPLACE_LABEL,
} from "@/lib/job-search/labels";
import * as repo from "@/lib/job-search/repository";
import { db, getOptions, getWorkspace } from "@/lib/job-search/server";
import { isClosed } from "@/lib/job-search/stages";
import { editorId } from "@/lib/admin/params";

export const metadata = { title: "Oportunidad" };

const TABS = [
  ["overview", "Resumen"],
  ["jd", "Oferta"],
  ["match", "Encaje"],
  ["contacts", "Contactos"],
  ["interviews", "Entrevistas"],
  ["tasks", "Tareas"],
  ["notes", "Notas"],
  ["documents", "Documentos"],
  ["activity", "Actividad"],
  ["edit", "Editar"],
] as const;
type Tab = (typeof TABS)[number][0];

/** Atajos de estado: los siguientes pasos lógicos desde cada fase, con sus automatizaciones. */
function quickTransitions(status: OpportunityStatus): OpportunityStatus[] {
  if (isClosed(status)) return ["qualified"];
  const pre: OpportunityStatus[] = ["qualified", "ready_to_apply", "applied"];
  const map: Partial<Record<OpportunityStatus, OpportunityStatus[]>> = {
    discovered: ["researching", "qualified", "archived"],
    researching: ["qualified", "archived"],
    qualified: ["ready_to_apply", "applied", "networking"],
    networking: ["ready_to_apply", "applied"],
    referral_requested: ["referral_received", "applied"],
    referral_received: ["applied"],
    ready_to_apply: ["applied"],
    applied: ["recruiter_screen", "interview", "rejected", "ghosted"],
    recruiter_screen: ["interview", "technical", "rejected"],
    interview: ["technical", "final_interview", "rejected"],
    technical: ["final_interview", "rejected"],
    final_interview: ["offer", "rejected"],
    offer: ["withdrawn"],
  };
  return (map[status] ?? pre).filter((s) => s !== status);
}

const money = (n: number | null) => (n ? n.toLocaleString("es-ES") : null);

export default async function OpportunityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; cv?: string }> }) {
  const id = await editorId(params);
  const sp = await searchParams;

  if (!id) {
    const companies = await repo.listCompanyNames(db);
    return (
      <div className="max-w-4xl">
        <Link href="/admin/job-search/opportunities" className="font-mono text-xs text-slate-600 hover:text-carbon">
          ← oportunidades
        </Link>
        <h1 className="page-title mt-3">Nueva oportunidad</h1>
        <div className="mt-8">
          <OpportunityForm companies={companies.map((c) => c.name)} />
        </div>
      </div>
    );
  }

  const [opp, { snapshot: s, engine, profile }, options, companies, docOptions, cvDocs, ai, drafts] = await Promise.all([
    repo.getOpportunity(db, id),
    getWorkspace(),
    getOptions(),
    repo.listCompanyNames(db),
    repo.listDocumentOptions(db),
    repo.listCvDocuments(db),
    getAiSettings(db),
    db.query.jobDocuments.findMany({ where: eq(jobDocuments.opportunityId, id), orderBy: (d, { desc }) => [desc(d.createdAt)] }),
  ]);
  if (!opp) notFound();

  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : "overview";
  const base = `/admin/job-search/opportunities/${id}`;
  const score = engine.scores.get(id);
  const label = opp.company ? `${opp.company.name} · ${opp.title}` : opp.title;
  const tz = s.goal.timezone;
  const openTasks = opp.tasks.filter((t) => t.status === "open").length;
  const daysInStage = Math.floor(daysBetween(opp.statusChangedAt, s.now));
  const counts: Partial<Record<Tab, number>> = {
    contacts: opp.contacts.length,
    activity: opp.activities.length,
    notes: opp.noteEntries.length,
    documents: opp.documents.length,
    interviews: opp.interviews.length,
    tasks: openTasks,
  };

  const transitions = quickTransitions(opp.status);
  const aiOff = ai.enabled ? undefined : "Activa la IA en Ajustes → Inteligencia artificial";
  const aiAnalysis = opp.aiAnalysis as (JobExtraction & { sources?: { uri: string; title: string | null }[]; model?: string; at?: string }) | null;
  const aiMatch = opp.aiMatch as VerifiedMatch | null;
  const nextTasks = opp.tasks.filter((t) => t.status === "open").slice(0, 4);
  const facts: [string, string][] = [
    ["Fuente", SOURCE_LABEL[opp.source]],
    ["Salario", opp.salaryMin || opp.salaryMax ? `${[money(opp.salaryMin), money(opp.salaryMax)].filter(Boolean).join(" – ")} ${opp.salaryCurrency ?? ""}${opp.salaryText ? ` · ${opp.salaryText}` : ""}` : (opp.salaryText ?? "—")],
    ["Publicada", formatDay(opp.postedAt)],
    ["Guardada", formatDay(opp.discoveredAt)],
    ["Aplicada", formatDay(opp.appliedAt)],
    ["Recomendación", opp.referrals.length ? REFERRAL_STATUS_LABEL[opp.referrals[0].status] : "—"],
    ...(opp.outcome ? ([["Resultado", OUTCOME_LABEL[opp.outcome]]] as [string, string][]) : []),
    ...(opp.discardReason ? ([["Motivo del descarte", opp.discardReason]] as [string, string][]) : []),
  ];
  // Fechas que piden acción, en una sola franja bajo la cabecera.
  const due = [
    opp.nextAction ? `Próxima acción: ${opp.nextAction}${opp.nextActionAt ? ` (${relativeDay(opp.nextActionAt, s.today)})` : ""}` : null,
    opp.nextFollowUpAt ? `Seguimiento ${relativeDay(opp.nextFollowUpAt, s.today)}` : null,
    opp.deadline && !opp.appliedAt ? `Cierre de candidaturas ${relativeDay(opp.deadline, s.today)}` : null,
    opp.offerDeadline ? `Responder a la oferta ${relativeDay(opp.offerDeadline, s.today)}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/job-search/opportunities" className="font-mono text-xs text-slate-600 hover:text-carbon">
          ← oportunidades
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="page-title break-words">{opp.title}</h1>
            <p className="mt-1 text-slate-700">
              {opp.company ? (
                <Link href={`/admin/job-search/companies/${opp.company.id}`} className="link">
                  {opp.company.name}
                </Link>
              ) : (
                <span className="text-slate-500">Sin empresa</span>
              )}
              {opp.location ? <span className="text-slate-500"> · {opp.location}</span> : null}
              {opp.workplace ? <span className="text-slate-500"> · {WORKPLACE_LABEL[opp.workplace]}</span> : null}
              {opp.url ? (
                <>
                  {" · "}
                  <a href={opp.url} target="_blank" rel="noopener noreferrer" className="link">
                    ver oferta ↗
                  </a>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
          <Link href={`${base}?tab=overview#puntuacion`} className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2 text-right hover:border-slate-300">
            <span className="block font-mono text-2xl text-carbon">{score?.score ?? "—"}</span>
            <span className="block text-[0.7rem] text-slate-500">{score?.overridden ? `manual · calculada ${score.computed}` : "puntuación"}</span>
            {aiMatch ? <span className="block text-[0.7rem] text-slate-500">encaje IA {aiMatch.score}%</span> : null}
          </Link>
          <AiButton action={reanalyzeAction} hidden={{ id }} label={aiAnalysis ? "Volver a analizar" : "Analizar con IA"} pendingLabel="Analizando…" disabled={aiOff ?? (!opp.url && !opp.description ? "Añade la URL o la descripción" : undefined)} />
          </div>
        </div>

        {/* Estado y siguientes pasos: lo que más se toca, siempre a mano (también en el móvil). */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <StatusSelect key={opp.status} id={id} status={opp.status} />
          <span className="flex flex-wrap items-center gap-1">
            {transitions.slice(0, 3).map((to, i) => (
              <ActionButton key={to} action={changeStatusAction} hidden={{ ids: id, status: to }} label={`${STATUS_LABEL[to]} →`} variant={i === 0 ? "ghost" : "link"} />
            ))}
          </span>
          <span className="flex items-center gap-3 text-xs text-slate-500">
            <PriorityTag priority={opp.priority} />
            <span>{daysInStage} d en este estado</span>
          </span>
        </div>
        {due.length ? (
          <p className="mt-3 rounded-md bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">{due.join(" · ")}</p>
        ) : null}
      </div>

      <Tabs current={tab} tabs={TABS.map(([key, l]) => ({ key, label: l, href: key === "overview" ? base : `${base}?tab=${key}`, count: counts[key] }))} />

      {tab === "overview" ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-8">
            {aiAnalysis ? (
              <Section title="Resumen de la oferta">
                <AiAnalysisCard analysis={aiAnalysis} />
              </Section>
            ) : null}
            <Section title="Datos">
              <dl className="panel grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
                {facts.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-slate-500">{k}</dt>
                    <dd className="mt-0.5 text-slate-800">{v}</dd>
                  </div>
                ))}
              </dl>
              {opp.notes ? (
                <div className="panel p-4">
                  <PlainText>{opp.notes}</PlainText>
                </div>
              ) : null}
            </Section>
            <Section title="Tareas abiertas" action={<Link href={`${base}?tab=tasks`} className="font-mono text-xs text-slate-600 hover:text-carbon">todas →</Link>}>
              <TaskList tasks={nextTasks} today={s.today} />
            </Section>
            <Section title="Últimos movimientos" action={<Link href={`${base}?tab=activity`} className="font-mono text-xs text-slate-600 hover:text-carbon">actividad →</Link>}>
              <Timeline activities={opp.activities.slice(0, 5)} timezone={tz} today={s.today} />
            </Section>
          </div>

          <Section title="Por qué esta puntuación" id="puntuacion">
            {score ? (
              <div className="panel divide-y divide-slate-200">
                {score.overridden ? (
                  <p className="px-4 py-3 text-sm text-slate-800">
                    Puntuación manual: <span className="font-mono">{score.score}</span> — {score.overrideReason}
                  </p>
                ) : null}
                {score.factors.map((f) => (
                  <div key={f.key} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-carbon">{f.label}</p>
                      <p className="font-mono text-xs text-slate-600">
                        {f.points}/{f.max}
                      </p>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-slate-100">
                      <div className="h-1 rounded-full bg-slate-500" style={{ width: `${(f.points / f.max) * 100}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600">{f.reason}</p>
                  </div>
                ))}
                <p className="px-4 py-2.5 text-right font-mono text-sm text-carbon">Calculada: {score.computed}/100</p>
              </div>
            ) : null}
          </Section>
        </div>
      ) : null}

      {tab === "edit" ? (
        <div className="max-w-4xl space-y-8">
          <OpportunityForm row={opp} companyName={opp.company?.name} companies={companies.map((c) => c.name)} />
          <div className="border-t border-slate-200 pt-6">
            <DeleteButton action={deleteOpportunityAction} hidden={{ id }} confirmText="¿Eliminar la oportunidad con toda su actividad, tareas y entrevistas? No se puede deshacer." />
          </div>
        </div>
      ) : null}

      {tab === "match" ? (
        <Section
          title="Encaje con tu CV (IA)"
          action={<AiButton action={matchAction} hidden={{ id }} label={aiMatch ? "Recalcular" : "Calcular encaje"} pendingLabel="Comparando con tu CV…" disabled={aiOff} />}
        >
          {aiMatch ? (
            <AiMatchCard match={aiMatch} company={opp.company?.name} />
          ) : (
            <Empty>Gemini compara la oferta con tu CV y solo da por buenos los puntos fuertes que puede citar literalmente de él.</Empty>
          )}
          <h3 className="label pt-4">Análisis local (sin IA)</h3>
        </Section>
      ) : null}

      {tab === "jd" || tab === "match" ? <AnalysisTabs tab={tab} opp={opp} profile={profile} today={s.today} cvDocs={cvDocs} cvParam={sp.cv} base={base} /> : null}

      {tab === "contacts" ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Section title="Personas del proceso">
            {opp.contacts.length ? (
              <ul className="panel divide-y divide-slate-200">
                {opp.contacts.map(({ contact, role }) => (
                  <li key={contact.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <Link href={`/admin/job-search/contacts/${contact.id}`} className="text-sm text-carbon hover:underline">
                        {contact.name}
                      </Link>
                      <p className="text-xs text-slate-600">
                        {CONTACT_KIND_LABEL[role]}
                        {contact.title ? ` · ${contact.title}` : ""}
                        {contact.lastInteractionAt ? ` · última interacción ${relativeDay(contact.lastInteractionAt, s.today)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {contact.email ? (
                        <a
                          className="btn-ghost"
                          href={mailto(contact.email, `Seguimiento · ${opp.title}`, `Hola ${contact.name.split(" ")[0]},\n\nQuería hacer seguimiento de mi candidatura para ${opp.title}.\n\nGracias,`)}
                        >
                          Escribir
                        </a>
                      ) : null}
                      <ActionButton action={unlinkContactAction} hidden={{ opportunityId: id, contactId: contact.id }} variant="link" label="Quitar" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Sin contactos vinculados.</Empty>
            )}
            {options.contacts.length ? (
              <ActionForm action={linkContactAction} hidden={{ opportunityId: id }} submitLabel="Vincular" className="panel grid gap-4 p-4 sm:grid-cols-2">
                <Select name="contactId" label="Contacto existente" options={options.contacts} />
                <Select name="role" label="Papel" options={OPTIONS.contactKind()} defaultValue="recruiter" />
              </ActionForm>
            ) : null}
            <details className="panel p-4">
              <summary className="cursor-pointer text-sm text-carbon">Nuevo contacto para este proceso</summary>
              <div className="mt-4">
                <ActionForm action={saveContactAction} hidden={{ opportunityId: id, stay: "true", companyName: opp.company?.name ?? "" }} submitLabel="Añadir" className="grid gap-4 sm:grid-cols-2">
                  <TextField name="name" label="Nombre" required />
                  <Select name="kind" label="Tipo" options={OPTIONS.contactKind()} defaultValue="recruiter" />
                  <TextField name="title" label="Cargo" />
                  <TextField name="linkedinUrl" label="LinkedIn" type="url" />
                  <TextField name="email" label="Correo" type="email" />
                </ActionForm>
              </div>
            </details>
          </Section>

          <Section title="Redactar un mensaje (IA)">
            {ai.enabled ? (
              <div className="panel p-4">
                <DraftMessage action={draftMessageAction} kinds={MESSAGE_KINDS} opportunityId={id} defaultKind="referral_request" />
              </div>
            ) : (
              <p className="text-sm text-slate-600">{aiOff}.</p>
            )}
          </Section>
          <Section title="Recomendaciones">
            {opp.referrals.length ? (
              <ul className="panel divide-y divide-slate-200">
                {opp.referrals.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <p className="text-sm text-carbon">{r.contact?.name ?? "Sin contacto asignado"}</p>
                      <p className="text-xs text-slate-600">
                        {REFERRAL_STATUS_LABEL[r.status]} · pedida {relativeDay(r.requestedAt, s.today)}
                        {r.receivedAt ? ` · recibida ${relativeDay(r.receivedAt, s.today)}` : ""}
                      </p>
                    </div>
                    {r.status === "requested" ? (
                      <div className="flex gap-1">
                        <ActionButton action={updateReferralAction} hidden={{ id: r.id, status: "received" }} label="Recibida" />
                        <ActionButton action={updateReferralAction} hidden={{ id: r.id, status: "no_response" }} variant="link" label="Sin respuesta" />
                        <ActionButton action={updateReferralAction} hidden={{ id: r.id, status: "declined" }} variant="link" label="Rechazada" />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Sin recomendaciones.</Empty>
            )}
            <ActionForm action={requestReferralAction} hidden={{ opportunityId: id }} submitLabel="Pedir recomendación" className="panel space-y-4 p-4">
              <Select name="contactId" label="A quién" options={[{ value: "", label: "— Sin especificar —" }, ...options.contacts]} />
              <TextField name="notes" label="Notas" />
              <p className="text-xs text-slate-600">Registra la actividad y crea un seguimiento a {s.goal.followupReferralDays} días laborables.</p>
            </ActionForm>
          </Section>
        </div>
      ) : null}

      {tab === "activity" ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Section title="Historial">
            <Timeline activities={opp.activities} timezone={tz} today={s.today} />
          </Section>
          <Section title="Historial de estados">
            <Table head={["Fecha", "De", "A"]} minWidth="20rem">
              {opp.history.map((h) => (
                <tr key={h.id}>
                  <td className={td}>
                    <Muted>{formatDateTime(h.changedAt, tz)}</Muted>
                  </td>
                  <td className={td}>{h.fromStatus ? STATUS_LABEL[h.fromStatus] : "—"}</td>
                  <td className={td}>{STATUS_LABEL[h.toStatus]}</td>
                </tr>
              ))}
            </Table>
          </Section>
        </div>
      ) : null}

      {tab === "notes" ? <Notes notes={opp.noteEntries} refs={{ opportunityId: id }} timezone={tz} today={s.today} /> : null}

      {tab === "documents" ? (
        <div className="space-y-6">
          <Section title="Carta de presentación con IA">
            {ai.enabled ? (
              <ActionForm action={coverLetterAction} hidden={{ opportunityId: id }} submitLabel="Generar carta" pendingLabel="Escribiendo la carta…" className="panel grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
                <Select name="language" label="Idioma" options={[{ value: "es", label: "Castellano" }, { value: "en", label: "Inglés" }]} defaultValue="es" />
                <Select name="tone" label="Tono" options={[{ value: "cercano", label: "Cercano" }, { value: "formal", label: "Formal" }, { value: "directo", label: "Directo" }]} defaultValue="cercano" />
                <Select name="length" label="Extensión" options={[{ value: "corta", label: "Corta (≈200 palabras)" }, { value: "media", label: "Media (≈300 palabras)" }]} defaultValue="corta" />
                <div className="sm:col-span-3">
                  <TextField name="notes" label="Indicaciones (opcional)" placeholder="Menciona que conozco su producto, que puedo empezar en…" />
                </div>
              </ActionForm>
            ) : (
              <p className="text-sm text-slate-600">{aiOff}.</p>
            )}
            {drafts.length ? (
              <ul className="space-y-3">
                {drafts.map((d) => (
                  <li key={d.id} className="panel p-4">
                    <details>
                      <summary className="cursor-pointer text-sm text-carbon">
                        {d.name} <span className="font-mono text-xs text-slate-500">{d.version}</span>
                      </summary>
                      <PlainText>{d.content}</PlainText>
                      {d.notes ? <p className="mt-3 whitespace-pre-wrap text-xs text-slate-600">{d.notes}</p> : null}
                      <p className="mt-3 text-xs text-slate-600">
                        Edítala en{" "}
                        <Link href="/admin/job-search/documents" className="link">
                          Documentos
                        </Link>{" "}
                        y regístrala abajo cuando la envíes.
                      </p>
                    </details>
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>
          {opp.documents.length ? (
            <Table head={["Documento", "Tipo", "Versión", "Usado", ""]}>
              {opp.documents.map(({ document: d, usedAt }) => (
                <tr key={d.id}>
                  <td className={td}>{d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="link">{d.name}</a> : d.name}</td>
                  <td className={td}>{DOCUMENT_KIND_LABEL[d.kind]}</td>
                  <td className={td}>
                    <Muted>{d.version ?? "—"}</Muted>
                  </td>
                  <td className={td}>
                    <Muted>{formatDay(usedAt)}</Muted>
                  </td>
                  <td className={td}>
                    <ActionButton action={unlinkDocumentAction} hidden={{ opportunityId: id, documentId: d.id }} variant="link" label="Quitar" />
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Aún no has registrado qué documentos enviaste.</Empty>
          )}
          {docOptions.length ? (
            <ActionForm action={linkDocumentAction} hidden={{ opportunityId: id }} submitLabel="Registrar" className="panel grid gap-4 p-4 sm:grid-cols-2">
              <Select name="documentId" label="Documento y versión" options={docOptions.map((d) => ({ value: d.id, label: `${DOCUMENT_KIND_LABEL[d.kind]} · ${d.name}${d.version ? ` (${d.version})` : ""}` }))} />
              <TextField name="usedAt" label="Fecha de envío" type="date" defaultValue={opp.appliedAt ?? s.today} />
            </ActionForm>
          ) : (
            <p className="text-sm text-slate-600">
              Crea primero tus documentos en{" "}
              <Link href="/admin/job-search/documents" className="link">
                Documentos
              </Link>
              .
            </p>
          )}
        </div>
      ) : null}

      {tab === "interviews" ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Section title="Entrevistas">
            {opp.interviews.length ? (
              <ul className="panel divide-y divide-slate-200">
                {opp.interviews.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <Link href={`/admin/job-search/interviews/${i.id}`} className="min-w-0 hover:underline">
                      <span className="block text-sm text-carbon">
                        {INTERVIEW_KIND_LABEL[i.kind]}
                        {i.round ? ` · ronda ${i.round}` : ""}
                        {i.interviewerName ? ` · ${i.interviewerName}` : ""}
                      </span>
                      <span className="block text-xs text-slate-600">
                        {formatDateTime(i.scheduledAt, i.timezone ?? tz)} · {INTERVIEW_OUTCOME_LABEL[i.outcome]}
                      </span>
                    </Link>
                    {i.scheduledAt ? (
                      <a
                        className="btn-ghost"
                        target="_blank"
                        rel="noopener noreferrer"
                        href={googleCalendarUrl({ id: i.id, title: `${INTERVIEW_KIND_LABEL[i.kind]} · ${label}`, start: i.scheduledAt, minutes: i.durationMinutes ?? 45, description: i.topics ?? "", location: i.meetingUrl })}
                      >
                        Calendario ↗
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Sin entrevistas.</Empty>
            )}
          </Section>
          <Section title="Programar entrevista">
            <ActionForm action={saveInterviewAction} hidden={{ opportunityId: id }} submitLabel="Programar" className="panel space-y-4 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Select name="kind" label="Tipo" options={OPTIONS.interviewKind()} defaultValue="recruiter_screen" />
                <TextField name="round" label="Ronda" type="number" defaultValue={opp.interviews.length + 1} />
                <TextField name="scheduledLocal" label="Fecha y hora" type="datetime-local" />
                <TextField name="timezone" label="Zona horaria" defaultValue={tz} />
                <TextField name="durationMinutes" label="Duración (min)" type="number" defaultValue={45} />
                <Select name="format" label="Formato" options={OPTIONS.interviewFormat("—")} defaultValue="video" />
              </div>
              <TextField name="meetingUrl" label="Enlace de la reunión" type="url" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select name="interviewerContactId" label="Entrevistador (contacto)" options={[{ value: "", label: "—" }, ...options.contacts]} />
                <TextField name="interviewerName" label="Entrevistador (nombre)" />
              </div>
              <TextArea name="topics" label="Temas" rows={2} />
              <p className="text-xs text-slate-600">Registra la actividad y crea una tarea de preparación y otra de agradecimiento a las 24 h.</p>
            </ActionForm>
          </Section>
        </div>
      ) : null}

      {tab === "tasks" ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Section title="Tareas">
            <TaskList tasks={opp.tasks} today={s.today} />
          </Section>
          <Section title="Nueva tarea">
            <div className="panel p-4">
              <TaskFields refs={{ opportunityId: id }} today={s.today} />
            </div>
          </Section>
        </div>
      ) : null}
    </div>
  );
}

type Opp = NonNullable<Awaited<ReturnType<typeof repo.getOpportunity>>>;

function Chips({ items, tone }: { items: string[]; tone?: "dark" | "muted" }) {
  if (!items.length) return <p className="text-sm text-slate-500">—</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <li key={i}>
          <Badge tone={tone}>{i}</Badge>
        </li>
      ))}
    </ul>
  );
}

function AnalysisTabs({
  tab,
  opp,
  profile,
  today,
  cvDocs,
  cvParam,
  base,
}: {
  tab: "jd" | "match";
  opp: Opp;
  profile: Awaited<ReturnType<typeof getWorkspace>>["profile"];
  today: string;
  cvDocs: Awaited<ReturnType<typeof repo.listCvDocuments>>;
  cvParam?: string;
  base: string;
}) {
  const result = analyzeOpportunity(opp, profile, today);
  if (!result) {
    return (
      <Empty>
        Pega el texto de la oferta en <Link href={`${base}?tab=edit`} className="link">Editar</Link> para analizarla. El análisis se hace aquí mismo: el texto no se envía a ningún servicio.
      </Empty>
    );
  }
  const { analysis: a, match } = result;

  if (tab === "jd") {
    return (
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Section title="Qué pide la oferta">
          <dl className="panel grid gap-4 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-mono text-[0.7rem] text-slate-500">Puesto</dt>
              <dd className="text-slate-800">{a.role ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[0.7rem] text-slate-500">Nivel</dt>
              <dd className="text-slate-800">{a.seniority ? `${SENIORITY_LABEL[a.seniority.value]}${a.seniority.inferred ? " (inferido de los años)" : ""}` : "—"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[0.7rem] text-slate-500">Experiencia</dt>
              <dd className="text-slate-800">{a.experience.minYears !== null ? `${a.experience.minYears}+ años` : "—"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[0.7rem] text-slate-500">Salario</dt>
              <dd className="text-slate-800">{a.salary ? a.salary.raw : "—"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[0.7rem] text-slate-500">Ubicación</dt>
              <dd className="text-slate-800">{[a.location, a.workplace ? WORKPLACE_LABEL[a.workplace] : null].filter(Boolean).join(" · ") || "—"}</dd>
            </div>
          </dl>
          {a.unstructured ? <p className="text-xs text-slate-600">La oferta no tiene secciones reconocibles: todas las habilidades se tratan como requeridas.</p> : null}
          <h3 className="label pt-2">Habilidades requeridas</h3>
          <Chips items={a.requiredSkills} tone="dark" />
          <h3 className="label pt-2">Habilidades deseables</h3>
          <Chips items={a.preferredSkills} />
          <h3 className="label pt-2">Herramientas</h3>
          <Chips items={a.tools} tone="muted" />
          <h3 className="label pt-2">Palabras clave</h3>
          <Chips items={a.keywords} tone="muted" />
          <h3 className="label pt-2">Responsabilidades</h3>
          {a.responsibilities.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
              {a.responsibilities.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No se detectó una sección de responsabilidades.</p>
          )}
          {a.experience.mentions.length ? (
            <>
              <h3 className="label pt-2">Menciones de experiencia</h3>
              <ul className="space-y-1 text-xs text-slate-600">
                {a.experience.mentions.map((m) => (
                  <li key={m}>“…{m}…”</li>
                ))}
              </ul>
            </>
          ) : null}
        </Section>
        <Section title="Texto de la oferta">
          <div className="panel max-h-[48rem] overflow-y-auto p-4">
            <PlainText>{opp.description}</PlainText>
          </div>
        </Section>
      </div>
    );
  }

  const cv = cvDocs.find((d) => d.id === cvParam) ?? cvDocs[0] ?? null;
  // Sin CV guardado, se compara con el perfil tal cual (experiencia registrada): nada inventado.
  const cvText = cv?.content ?? profile.experiences.flatMap((e) => e.lines).join("\n");
  const cvm = matchCv(a, cvText, profile);

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Section title={`Habilidades que encajan · ${match.matchedSkills.length}`}>
          {match.matchedSkills.length ? (
            <ul className="panel divide-y divide-slate-200">
              {match.matchedSkills.map((m) => (
                <li key={m.skill} className="px-4 py-2">
                  <span className="text-sm text-carbon">{m.skill}</span>
                  <span className="block text-xs text-slate-600">Respaldo: {m.sources.join(" · ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Ninguna habilidad de la oferta aparece en tu perfil.</Empty>
          )}
        </Section>
        <Section title="Lo que falta">
          <div className="panel space-y-3 p-4">
            <div>
              <p className="text-xs text-slate-500">Requeridas sin respaldo en tu perfil</p>
              <Chips items={match.missingRequired} tone="dark" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Deseables sin respaldo</p>
              <Chips items={match.missingPreferred} />
            </div>
            {match.gaps.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
                {match.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">Sin gaps detectados.</p>
            )}
            <p className="font-mono text-xs text-slate-500">Experiencia registrada: {match.profileYears} años</p>
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Section title="Experiencia relevante">
          {match.relevantExperience.length ? (
            <ul className="panel divide-y divide-slate-200">
              {match.relevantExperience.map((r, i) => (
                <li key={i} className="px-4 py-2.5">
                  <p className="text-sm text-slate-800">{r.line}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {r.label} · {r.terms.join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Ningún logro de tu experiencia menciona lo que pide la oferta.</Empty>
          )}
        </Section>
        <Section title="Palabras clave y recomendaciones">
          <div className="panel space-y-4 p-4">
            <ul className="flex flex-wrap gap-1.5">
              {match.keywords.map((k) => (
                <li key={k.keyword}>
                  <Badge tone={k.inProfile ? "dark" : "muted"} title={k.inProfile ? "Aparece en tu perfil" : "No aparece en tu perfil"}>
                    {k.inProfile ? "✓ " : ""}
                    {k.keyword}
                  </Badge>
                </li>
              ))}
            </ul>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-800">
              {match.recommendations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </Section>
      </div>

      <Section
        title="Comparación con tu CV"
        action={
          cvDocs.length > 1 ? (
            <form className="flex items-center gap-2">
              <input type="hidden" name="tab" value="match" />
              <label htmlFor="cv-pick" className="sr-only">
                CV
              </label>
              <select id="cv-pick" name="cv" defaultValue={cv?.id} className="field w-auto py-1 text-xs">
                {cvDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.version ? ` (${d.version})` : ""}
                  </option>
                ))}
              </select>
              <button className="btn-ghost">Comparar</button>
            </form>
          ) : null
        }
      >
        <p className="text-sm text-slate-600">
          {cv ? (
            <>
              Comparando con <span className="text-carbon">{cv.name}{cv.version ? ` (${cv.version})` : ""}</span>.
            </>
          ) : (
            <>
              No hay ningún CV con texto en{" "}
              <Link href="/admin/job-search/documents" className="link">
                Documentos
              </Link>
              : se compara con tu experiencia registrada.
            </>
          )}{" "}
          Las sugerencias solo reordenan o destacan contenido que ya existe.
        </p>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CvBlock title="Experiencia a enfatizar" empty="Ninguna línea del CV cubre dos o más términos de la oferta.">
            {cvm.emphasize.map((e) => (
              <li key={e.line} className="px-4 py-2.5">
                <p className="text-sm text-slate-800">{e.line}</p>
                <p className="text-xs text-slate-500">{e.terms.join(", ")}</p>
              </li>
            ))}
          </CvBlock>
          <CvBlock title="Bullets a mejorar" empty="Nada que mejorar en las líneas relevantes.">
            {cvm.improve.map((e) => (
              <li key={e.line} className="px-4 py-2.5">
                <p className="text-sm text-slate-800">{e.line}</p>
                <p className="text-xs text-slate-500">{e.reason}</p>
              </li>
            ))}
          </CvBlock>
          <CvBlock title="Contenido a mover" empty="El contenido relevante ya está arriba.">
            {cvm.move.map((e) => (
              <li key={e.line} className="px-4 py-2.5">
                <p className="text-sm text-slate-800">{e.line}</p>
                <p className="text-xs text-slate-500">{e.reason}</p>
              </li>
            ))}
          </CvBlock>
          <CvBlock title="Poco relevante para esta oferta" empty="Todo el CV toca algún término de la oferta.">
            {cvm.irrelevant.map((l) => (
              <li key={l} className="px-4 py-2.5 text-sm text-slate-700">
                {l}
              </li>
            ))}
          </CvBlock>
          <CvBlock title="Palabras clave que puedes añadir (con respaldo)" empty="El CV ya incluye todas las palabras clave que tu perfil respalda.">
            {cvm.keywordsToAdd.map((k) => (
              <li key={k.keyword} className="px-4 py-2.5 text-sm text-slate-800">
                {k.keyword} <span className="text-xs text-slate-500">· respaldo: {k.evidence}</span>
              </li>
            ))}
          </CvBlock>
          <CvBlock title="Proyectos relevantes" empty="Ningún proyecto usa lo que pide la oferta.">
            {cvm.projects.map((p) => (
              <li key={p.title} className="px-4 py-2.5 text-sm text-slate-800">
                {p.title} <span className="text-xs text-slate-500">· {p.terms.join(", ")}</span>
              </li>
            ))}
          </CvBlock>
        </div>
        {cvm.keywordsMissing.length ? (
          <p className="text-sm text-slate-700">
            <span className="font-medium text-carbon">Sin respaldo en tu perfil (no las añadas):</span> {cvm.keywordsMissing.join(", ")}.
          </p>
        ) : null}
      </Section>
    </div>
  );
}

function CvBlock({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="space-y-2">
      <h3 className="font-mono text-xs text-slate-600">{title}</h3>
      {children.length ? <ul className="panel divide-y divide-slate-200">{children}</ul> : <Empty>{empty}</Empty>}
    </div>
  );
}

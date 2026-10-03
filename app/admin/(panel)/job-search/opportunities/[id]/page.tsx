import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { Select, TextArea, TextField } from "@/components/admin/fields";
import { ActionButton } from "@/components/admin/job-search/ActionButton";
import { Notes, TaskFields, TaskList, Timeline } from "@/components/admin/job-search/lists";
import { OpportunityForm } from "@/components/admin/job-search/OpportunityForm";
import { Badge, Empty, Muted, PlainText, PriorityTag, Section, StatusBadge, Table, Tabs, td } from "@/components/admin/job-search/ui";
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
  ["overview", "Overview"],
  ["jd", "Job Description"],
  ["match", "Match"],
  ["contacts", "Contacts"],
  ["activity", "Activity"],
  ["notes", "Notes"],
  ["documents", "Documents"],
  ["interviews", "Interviews"],
  ["tasks", "Tasks"],
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
          ← opportunities
        </Link>
        <h1 className="page-title mt-3">Nueva oportunidad</h1>
        <div className="mt-8">
          <OpportunityForm companies={companies.map((c) => c.name)} />
        </div>
      </div>
    );
  }

  const [opp, { snapshot: s, engine, profile }, options, companies, docOptions, cvDocs] = await Promise.all([
    repo.getOpportunity(db, id),
    getWorkspace(),
    getOptions(),
    repo.listCompanyNames(db),
    repo.listDocumentOptions(db),
    repo.listCvDocuments(db),
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

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/job-search/opportunities" className="font-mono text-xs text-slate-600 hover:text-carbon">
          ← opportunities
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
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
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-3">
              <StatusBadge status={opp.status} />
              <PriorityTag priority={opp.priority} />
              <Muted>{daysInStage} d en fase</Muted>
              {opp.url ? (
                <a href={opp.url} target="_blank" rel="noopener noreferrer" className="link text-sm">
                  Ver oferta ↗
                </a>
              ) : null}
            </p>
          </div>
          <div className="panel px-4 py-3 text-right">
            <p className="label">Score</p>
            <p className="font-mono text-3xl text-carbon">{score?.score ?? "—"}</p>
            {score?.overridden ? <p className="font-mono text-[0.7rem] text-slate-500">override · calculado {score.computed}</p> : null}
          </div>
        </div>
      </div>

      {/* Cambio de estado rápido: la acción más frecuente, accesible también desde el móvil. */}
      <div className="flex flex-wrap items-center gap-2">
        {quickTransitions(opp.status).map((to) => (
          <ActionButton key={to} action={changeStatusAction} hidden={{ ids: id, status: to }} label={`→ ${STATUS_LABEL[to]}`} />
        ))}
        <details className="relative">
          <summary className="btn-ghost cursor-pointer list-none">Otro estado…</summary>
          <div className="panel absolute z-20 mt-2 w-72 p-4 shadow-lg">
            <ActionForm action={changeStatusAction} hidden={{ ids: id }} submitLabel="Cambiar">
              <Select name="status" label="Estado" options={OPTIONS.status()} defaultValue={opp.status} />
            </ActionForm>
          </div>
        </details>
      </div>

      <Tabs current={tab} tabs={TABS.map(([key, l]) => ({ key, label: l, href: key === "overview" ? base : `${base}?tab=${key}`, count: counts[key] }))} />

      {tab === "overview" ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Section title="Resumen">
            <dl className="panel grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
              {[
                ["Fuente", SOURCE_LABEL[opp.source]],
                ["Salario", opp.salaryMin || opp.salaryMax ? `${[money(opp.salaryMin), money(opp.salaryMax)].filter(Boolean).join(" – ")} ${opp.salaryCurrency ?? ""}${opp.salaryText ? ` · ${opp.salaryText}` : ""}` : (opp.salaryText ?? "—")],
                ["Publicada", formatDay(opp.postedAt)],
                ["Descubierta", formatDay(opp.discoveredAt)],
                ["Aplicada", formatDay(opp.appliedAt)],
                ["Deadline", opp.deadline ? `${formatDay(opp.deadline)} (${relativeDay(opp.deadline, s.today)})` : "—"],
                ["Próxima acción", opp.nextAction ? `${opp.nextAction}${opp.nextActionAt ? ` · ${relativeDay(opp.nextActionAt, s.today)}` : ""}` : "—"],
                ["Próximo follow-up", opp.nextFollowUpAt ? `${formatDay(opp.nextFollowUpAt)} (${relativeDay(opp.nextFollowUpAt, s.today)})` : "—"],
                ["Referral", opp.referrals.length ? REFERRAL_STATUS_LABEL[opp.referrals[0].status] : "—"],
                ["Resultado", opp.outcome ? OUTCOME_LABEL[opp.outcome] : "—"],
                ...(opp.offerDeadline ? [["Responder oferta", `${formatDay(opp.offerDeadline)} (${relativeDay(opp.offerDeadline, s.today)})`]] : []),
                ...(opp.discardReason ? [["Motivo descarte", opp.discardReason]] : []),
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="font-mono text-[0.7rem] text-slate-500">{k}</dt>
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

          <Section title="Por qué este score">
            {score ? (
              <div className="panel divide-y divide-slate-200">
                {score.overridden ? (
                  <p className="px-4 py-3 text-sm text-slate-800">
                    Override manual: <span className="font-mono">{score.score}</span> — {score.overrideReason}
                  </p>
                ) : null}
                {score.factors.map((f) => (
                  <div key={f.key} className="grid grid-cols-[1fr_auto] gap-x-3 px-4 py-2.5">
                    <p className="text-sm text-carbon">{f.label}</p>
                    <p className="font-mono text-sm text-carbon">
                      {f.points}
                      <span className="text-slate-500">/{f.max}</span>
                    </p>
                    <p className="col-span-2 text-xs text-slate-600">{f.reason}</p>
                  </div>
                ))}
                <p className="px-4 py-2.5 text-right font-mono text-sm text-carbon">Calculado: {score.computed}/100</p>
              </div>
            ) : null}
          </Section>

          <div className="lg:col-span-2">
            <details className="panel p-4">
              <summary className="cursor-pointer font-medium text-carbon">Editar oportunidad</summary>
              <div className="mt-6">
                <OpportunityForm row={opp} companyName={opp.company?.name} companies={companies.map((c) => c.name)} />
              </div>
              <div className="mt-8 border-t border-slate-200 pt-6">
                <DeleteButton action={deleteOpportunityAction} hidden={{ id }} confirmText="¿Eliminar la oportunidad con toda su actividad, tareas y entrevistas? No se puede deshacer." />
              </div>
            </details>
          </div>
        </div>
      ) : null}

      {tab === "jd" || tab === "match" ? <AnalysisTabs tab={tab} opp={opp} profile={profile} today={s.today} cvDocs={cvDocs} cvParam={sp.cv} base={base} /> : null}

      {tab === "contacts" ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="Contactos del proceso">
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
                          Email
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
                  <TextField name="email" label="Email" type="email" />
                </ActionForm>
              </div>
            </details>
          </Section>

          <Section title="Referrals">
            {opp.referrals.length ? (
              <ul className="panel divide-y divide-slate-200">
                {opp.referrals.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <p className="text-sm text-carbon">{r.contact?.name ?? "Sin contacto asignado"}</p>
                      <p className="text-xs text-slate-600">
                        {REFERRAL_STATUS_LABEL[r.status]} · pedido {relativeDay(r.requestedAt, s.today)}
                        {r.receivedAt ? ` · recibido ${relativeDay(r.receivedAt, s.today)}` : ""}
                      </p>
                    </div>
                    {r.status === "requested" ? (
                      <div className="flex gap-1">
                        <ActionButton action={updateReferralAction} hidden={{ id: r.id, status: "received" }} label="Recibido" />
                        <ActionButton action={updateReferralAction} hidden={{ id: r.id, status: "no_response" }} variant="link" label="Sin respuesta" />
                        <ActionButton action={updateReferralAction} hidden={{ id: r.id, status: "declined" }} variant="link" label="Rechazado" />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Sin referrals.</Empty>
            )}
            <ActionForm action={requestReferralAction} hidden={{ opportunityId: id }} submitLabel="Pedir referral" className="panel space-y-4 p-4">
              <Select name="contactId" label="A quién" options={[{ value: "", label: "— Sin especificar —" }, ...options.contacts]} />
              <TextField name="notes" label="Notas" />
              <p className="text-xs text-slate-600">Crea la actividad y un follow-up a {s.goal.followupReferralDays} días laborables.</p>
            </ActionForm>
          </Section>
        </div>
      ) : null}

      {tab === "activity" ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Section title="Timeline">
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
            <Empty>No has registrado qué documentos enviaste.</Empty>
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
                Documents
              </Link>
              .
            </p>
          )}
        </div>
      ) : null}

      {tab === "interviews" ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
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
                        Calendar ↗
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
              <p className="text-xs text-slate-600">Crea la actividad, una tarea de preparación y otra de thank-you en 24 h.</p>
            </ActionForm>
          </Section>
        </div>
      ) : null}

      {tab === "tasks" ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
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
        Pega la Job Description en <Link href={base} className="link">Overview → Editar</Link> para analizarla. El análisis es local y determinista: no se envía a ningún servicio.
      </Empty>
    );
  }
  const { analysis: a, match } = result;

  if (tab === "jd") {
    return (
      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Extraído de la JD">
          <dl className="panel grid gap-4 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-mono text-[0.7rem] text-slate-500">Role</dt>
              <dd className="text-slate-800">{a.role ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[0.7rem] text-slate-500">Seniority</dt>
              <dd className="text-slate-800">{a.seniority ? `${SENIORITY_LABEL[a.seniority.value]}${a.seniority.inferred ? " (inferido de los años)" : ""}` : "—"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[0.7rem] text-slate-500">Experience</dt>
              <dd className="text-slate-800">{a.experience.minYears !== null ? `${a.experience.minYears}+ años` : "—"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[0.7rem] text-slate-500">Salary</dt>
              <dd className="text-slate-800">{a.salary ? a.salary.raw : "—"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[0.7rem] text-slate-500">Location</dt>
              <dd className="text-slate-800">{[a.location, a.workplace ? WORKPLACE_LABEL[a.workplace] : null].filter(Boolean).join(" · ") || "—"}</dd>
            </div>
          </dl>
          {a.unstructured ? <p className="text-xs text-slate-600">La JD no tiene secciones reconocibles: todas las habilidades se tratan como requeridas.</p> : null}
          <h3 className="label pt-2">Required skills</h3>
          <Chips items={a.requiredSkills} tone="dark" />
          <h3 className="label pt-2">Preferred skills</h3>
          <Chips items={a.preferredSkills} />
          <h3 className="label pt-2">Tools</h3>
          <Chips items={a.tools} tone="muted" />
          <h3 className="label pt-2">Keywords</h3>
          <Chips items={a.keywords} tone="muted" />
          <h3 className="label pt-2">Responsibilities</h3>
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
        <Section title="Texto original">
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
      <div className="grid gap-8 lg:grid-cols-2">
        <Section title={`Matched skills · ${match.matchedSkills.length}`}>
          {match.matchedSkills.length ? (
            <ul className="panel divide-y divide-slate-200">
              {match.matchedSkills.map((m) => (
                <li key={m.skill} className="px-4 py-2">
                  <span className="text-sm text-carbon">{m.skill}</span>
                  <span className="block text-xs text-slate-600">Evidencia: {m.sources.join(" · ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Ninguna habilidad de la JD aparece en tu perfil.</Empty>
          )}
        </Section>
        <Section title="Missing skills y gaps">
          <div className="panel space-y-3 p-4">
            <div>
              <p className="font-mono text-[0.7rem] text-slate-500">Requeridas sin evidencia</p>
              <Chips items={match.missingRequired} tone="dark" />
            </div>
            <div>
              <p className="font-mono text-[0.7rem] text-slate-500">Deseables sin evidencia</p>
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

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Relevant experience">
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
            <Empty>Ningún logro de tu experiencia menciona lo que pide la JD.</Empty>
          )}
        </Section>
        <Section title="Keywords y recomendaciones">
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
        title="CV matching"
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
                Documents
              </Link>
              : se compara con tu experiencia registrada.
            </>
          )}{" "}
          Las sugerencias solo reordenan o destacan contenido que ya existe.
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          <CvBlock title="Experiencia a enfatizar" empty="Ninguna línea del CV cubre dos o más términos de la JD.">
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
          <CvBlock title="Contenido poco relevante para esta JD" empty="Todo el CV toca algún término de la JD.">
            {cvm.irrelevant.map((l) => (
              <li key={l} className="px-4 py-2.5 text-sm text-slate-700">
                {l}
              </li>
            ))}
          </CvBlock>
          <CvBlock title="Keywords que puedes añadir (con evidencia)" empty="El CV ya incluye todas las keywords que tu perfil respalda.">
            {cvm.keywordsToAdd.map((k) => (
              <li key={k.keyword} className="px-4 py-2.5 text-sm text-slate-800">
                {k.keyword} <span className="text-xs text-slate-500">· evidencia: {k.evidence}</span>
              </li>
            ))}
          </CvBlock>
          <CvBlock title="Proyectos relevantes" empty="Ningún proyecto usa lo que pide la JD.">
            {cvm.projects.map((p) => (
              <li key={p.title} className="px-4 py-2.5 text-sm text-slate-800">
                {p.title} <span className="text-xs text-slate-500">· {p.terms.join(", ")}</span>
              </li>
            ))}
          </CvBlock>
        </div>
        {cvm.keywordsMissing.length ? (
          <p className="text-sm text-slate-700">
            <span className="font-medium text-carbon">Sin evidencia en tu perfil (no añadir):</span> {cvm.keywordsMissing.join(", ")}.
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

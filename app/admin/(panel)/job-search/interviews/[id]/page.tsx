import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { TextArea } from "@/components/admin/fields";
import { ChecklistField } from "@/components/admin/job-search/ChecklistField";
import { InterviewForm } from "@/components/admin/job-search/InterviewForm";
import { Notes, TaskList } from "@/components/admin/job-search/lists";
import { Badge, Empty, PlainText, Section, StatusBadge } from "@/components/admin/job-search/ui";
import { deleteInterviewAction, saveInterviewPrepAction } from "@/lib/job-search/actions";
import { googleCalendarUrl } from "@/lib/job-search/calendar";
import { dateIn, formatDateTime, relativeDay } from "@/lib/job-search/dates";
import { analyzeOpportunity } from "@/lib/job-search/engine";
import { INTERVIEW_FORMAT_LABEL, INTERVIEW_KIND_LABEL, INTERVIEW_OUTCOME_LABEL } from "@/lib/job-search/labels";
import { editorId } from "@/lib/admin/params";
import { getInterview } from "@/lib/job-search/repository";
import { db, getOptions, getWorkspace } from "@/lib/job-search/server";

export const metadata = { title: "Entrevista" };

/** Puntos genéricos de preparación; el checklist es editable y cada uno se marca a mano. */
const DEFAULT_CHECKLIST = [
  "Investigar empresa, producto y noticias recientes",
  "Releer la JD y el CV que enviaste",
  "Pitch de 2 minutos sobre tu trayectoria",
  "Elegir 3 historias STAR para esta entrevista",
  "Preparar preguntas para la empresa",
  "Probar enlace, cámara y audio",
];

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const id = await editorId(params);
  if (!id) redirect("/admin/job-search/interviews");
  const [data, { snapshot: s, profile }, options] = await Promise.all([getInterview(db, id), getWorkspace(), getOptions()]);
  if (!data) notFound();
  const { interview: i, tasks, notes, stories, previous } = data;
  const o = i.opportunity;
  const tz = i.timezone ?? s.goal.timezone;
  const label = o.company ? `${o.company.name} · ${o.title}` : o.title;
  const jd = analyzeOpportunity(o, profile, s.today);
  const chosen = new Set(i.starStoryIds);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/job-search/interviews" className="font-mono text-xs text-slate-600 hover:text-carbon">
          ← interviews
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title">
              {INTERVIEW_KIND_LABEL[i.kind]}
              {i.round ? <span className="font-normal text-slate-500"> · ronda {i.round}</span> : null}
            </h1>
            <p className="mt-1">
              <Link href={`/admin/job-search/opportunities/${o.id}`} className="link">
                {label}
              </Link>
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <StatusBadge status={o.status} />
              <Badge>{INTERVIEW_OUTCOME_LABEL[i.outcome]}</Badge>
              <span>
                {formatDateTime(i.scheduledAt, tz)} {i.scheduledAt ? <span className="text-slate-500">({tz} · {relativeDay(dateIn(i.scheduledAt, tz), s.today)})</span> : null}
              </span>
              {i.format ? <span className="text-slate-500">· {INTERVIEW_FORMAT_LABEL[i.format]}</span> : null}
              {i.interviewerName || i.interviewer ? <span className="text-slate-500">· con {i.interviewer?.name ?? i.interviewerName}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {i.meetingUrl ? (
              <a href={i.meetingUrl} target="_blank" rel="noopener noreferrer" className="btn">
                Abrir reunión ↗
              </a>
            ) : null}
            {i.scheduledAt ? (
              <>
                <a
                  href={googleCalendarUrl({ id: i.id, title: `${INTERVIEW_KIND_LABEL[i.kind]} · ${label}`, start: i.scheduledAt, minutes: i.durationMinutes ?? 45, description: i.topics ?? "", location: i.meetingUrl })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost"
                >
                  Google Calendar ↗
                </a>
                <a href={`/admin/job-search/interviews/${i.id}/ics`} className="btn-ghost">
                  .ics
                </a>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <Section title="Interview prep">
        <ActionForm action={saveInterviewPrepAction} hidden={{ id: i.id }} submitLabel="Guardar preparación" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="panel space-y-4 p-4">
              <TextArea name="prepCompany" label="Company research" rows={5} defaultValue={i.prepCompany} hint="Producto, modelo de negocio, noticias, cultura, stack." />
              <TextArea name="prepRole" label="Role research" rows={5} defaultValue={i.prepRole} />
              {jd ? (
                <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-700">
                  <p className="font-mono text-slate-500">De la JD</p>
                  {jd.analysis.responsibilities.length ? <p className="mt-1">Responsabilidades: {jd.analysis.responsibilities.slice(0, 4).join(" · ")}</p> : null}
                  {jd.analysis.requiredSkills.length ? <p className="mt-1">Requisitos: {jd.analysis.requiredSkills.join(", ")}</p> : null}
                  {jd.match.missingRequired.length ? <p className="mt-1">Gaps a preparar con honestidad: {jd.match.missingRequired.join(", ")}</p> : null}
                </div>
              ) : null}
              <TextArea name="prepInterviewer" label="Interviewer" rows={3} defaultValue={i.prepInterviewer} hint="Rol, trayectoria, en qué se fijará." />
            </div>
            <div className="panel space-y-4 p-4">
              <TextArea name="prepQuestions" label="Expected questions" rows={5} defaultValue={i.prepQuestions} />
              <TextArea name="prepAnswers" label="Prepared answers" rows={7} defaultValue={i.prepAnswers} />
              <TextArea name="prepQuestionsToAsk" label="Questions to ask" rows={4} defaultValue={i.prepQuestionsToAsk} />
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="panel p-4">
              <ChecklistField name="prepChecklist" label="Checklist" defaultValue={i.prepChecklist} suggestions={DEFAULT_CHECKLIST} />
            </div>
            <div className="panel p-4">
              <fieldset className="space-y-2">
                <legend className="field-label flex w-full items-center justify-between">
                  STAR stories
                  <Link href="/admin/job-search/interviews/stories" className="font-mono text-xs font-normal text-slate-600 hover:text-carbon">
                    biblioteca →
                  </Link>
                </legend>
                {stories.length ? (
                  stories.map((st) => (
                    <label key={st.id} className="flex items-start gap-2 text-sm text-slate-800">
                      <input type="checkbox" name="starStoryIds" value={st.id} defaultChecked={chosen.has(st.id)} className="mt-1 size-3.5 accent-primary" />
                      <span>
                        {st.title}
                        {st.result ? <span className="block text-xs text-slate-500">Resultado: {st.result}</span> : null}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">Aún no tienes historias. Escríbelas una vez y reutilízalas.</p>
                )}
              </fieldset>
            </div>
          </div>
        </ActionForm>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Tareas de esta entrevista">
          <TaskList tasks={tasks} today={s.today} />
        </Section>
        <Section title="Rondas anteriores">
          {previous.length ? (
            <ul className="space-y-3">
              {previous.map((p) => (
                <li key={p.id} className="panel p-4">
                  <Link href={`/admin/job-search/interviews/${p.id}`} className="text-sm text-carbon hover:underline">
                    {INTERVIEW_KIND_LABEL[p.kind]} · {formatDateTime(p.scheduledAt, p.timezone ?? tz)} · {INTERVIEW_OUTCOME_LABEL[p.outcome]}
                  </Link>
                  {p.notes ? (
                    <div className="mt-2">
                      <PlainText>{p.notes}</PlainText>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Es la primera ronda de este proceso.</Empty>
          )}
        </Section>
      </div>

      <Section title="Notas">
        <Notes notes={notes} refs={{ interviewId: i.id, opportunityId: o.id }} timezone={s.goal.timezone} today={s.today} />
      </Section>

      <details className="panel p-4" open={i.outcome === "pending" && !!i.scheduledAt && i.scheduledAt < s.now}>
        <summary className="cursor-pointer font-medium text-carbon">Editar entrevista y registrar resultado</summary>
        <div className="mt-6">
          <InterviewForm row={i} opportunities={options.opportunities} contacts={options.contacts} timezone={s.goal.timezone} />
        </div>
        <div className="mt-8 border-t border-slate-200 pt-6">
          <DeleteButton action={deleteInterviewAction} hidden={{ id: i.id }} />
        </div>
      </details>
    </div>
  );
}

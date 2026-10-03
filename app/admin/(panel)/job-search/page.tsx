import Link from "next/link";
import { ActionButton } from "@/components/admin/job-search/ActionButton";
import { BarRow, Badge, Empty, PriorityTag, Section, Stat, StatusBadge } from "@/components/admin/job-search/ui";
import { setTaskDoneAction } from "@/lib/job-search/actions";
import { bottleneck, FUNNEL_STEPS, funnel, pct } from "@/lib/job-search/analytics";
import { dateIn, formatDateTime, relativeDay } from "@/lib/job-search/dates";
import { scoreValues } from "@/lib/job-search/engine";
import { ACTIVITY_LABEL, INTERVIEW_KIND_LABEL } from "@/lib/job-search/labels";
import { oppLabel } from "@/lib/job-search/model";
import { alerts, dailyPlan, dashboardKpis, oppHref, PLAN_CATEGORIES } from "@/lib/job-search/plan";
import { db, getWorkspace } from "@/lib/job-search/server";
import { getGoal, recentActivity } from "@/lib/job-search/repository";
import { isClosed } from "@/lib/job-search/stages";

export const metadata = { title: "Dashboard" };

const B = "/admin/job-search";

export default async function JobSearchDashboard() {
  const [{ snapshot: s, engine }, { row: goalRow }, activity] = await Promise.all([getWorkspace(), getGoal(db), recentActivity(db, 12)]);
  const kpi = dashboardKpis(s);
  const scores = scoreValues(engine);
  const plan = dailyPlan(s, scores);
  const alertList = alerts(s);
  const neck = bottleneck(s, engine.facts);
  const f = funnel(engine.facts);
  const topAction = plan[0];
  const bestSource = engine.sources.find((r) => r.applications >= 5 && r.interviews > 0) ?? null;
  const tz = s.goal.timezone;

  const priorities = s.opportunities
    .filter((o) => !isClosed(o.status) && o.status !== "discovered")
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
    .slice(0, 6);
  const upcoming = s.interviews
    .filter((i) => i.outcome === "pending" && i.scheduledAt && i.scheduledAt >= new Date(s.now.getTime() - 3_600_000))
    .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())
    .slice(0, 4);
  const opps = new Map(s.opportunities.map((o) => [o.id, o]));
  const toContact = s.contacts
    .filter((c) => c.status === "to_contact" || (c.nextFollowUpAt && c.nextFollowUpAt <= s.today && c.status !== "closed"))
    .slice(0, 5);
  const progress = Math.min(100, (kpi.day / kpi.duration) * 100);

  return (
    <div className="space-y-10">
      {!goalRow ? (
        <p className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-slate-700">
          El contador empieza hoy por defecto. Fija la fecha de inicio, tu rol objetivo y tus reglas de follow-up.
          <Link href={`${B}/settings`} className="btn-ghost">
            Configurar objetivo
          </Link>
        </p>
      ) : null}

      {/* Cabecera: día del objetivo, bottleneck y la acción de mayor impacto. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="panel p-5">
          <p className="label">Objetivo · trabajo en {kpi.duration} días</p>
          <p className="mt-3 text-5xl font-semibold tracking-tight text-carbon">
            Day {kpi.day}
            <span className="text-2xl font-normal text-slate-500"> / {kpi.duration}</span>
          </p>
          <div className="mt-4 h-2 rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={kpi.duration} aria-valuenow={kpi.day} aria-label="Progreso del objetivo">
            <div className="h-2 rounded-full bg-carbon" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 font-mono text-xs text-slate-600">
            {kpi.overrun ? `Objetivo superado en ${kpi.overrun} días` : `${kpi.remaining} días restantes`} · inicio {s.goal.startDate}
          </p>
        </div>
        <div className="panel grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <p className="label">Acción prioritaria de hoy</p>
            {topAction ? (
              <>
                <Link href={topAction.href} className="mt-3 block text-lg font-medium text-carbon hover:underline">
                  {topAction.title}
                </Link>
                <p className="mt-1 text-sm text-slate-600">{topAction.reason}</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-600">Nada urgente. Añade oportunidades al inbox para alimentar el funnel.</p>
            )}
          </div>
          <div className="sm:border-l sm:border-slate-200 sm:pl-4">
            <p className="label">Principal bottleneck</p>
            {neck ? (
              <>
                <p className="mt-3 flex items-center gap-2 text-lg font-medium text-carbon">
                  <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
                  {neck.stage}
                </p>
                <p className="mt-1 text-sm text-slate-600">{neck.reason}</p>
                <p className="mt-2 text-sm text-slate-800">→ {neck.action}</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-600">Insufficient data — o ninguna fase por debajo de la referencia.</p>
            )}
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Candidaturas activas" value={kpi.activeApplications} href={`${B}/pipeline`} />
        <Stat label="Entrevistas activas" value={kpi.activeInterviews} hint={`${kpi.upcomingInterviews} programadas`} href={`${B}/interviews`} />
        <Stat label="Procesos finales" value={kpi.finals} href={`${B}/opportunities?stage=interviewing`} />
        <Stat label="Ofertas" value={kpi.offers} href={`${B}/opportunities?status=offer`} />
        <Stat label="Follow-ups pendientes" value={kpi.followUpsDue} href={`${B}/tasks?view=overdue`} />
        <Stat label="Tareas de hoy" value={kpi.tasksToday} href={`${B}/tasks`} />
      </dl>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Section title="Plan de hoy" action={<Link href={`${B}/tasks`} className="font-mono text-xs text-slate-600 hover:text-carbon">todas las tareas →</Link>}>
          {plan.length ? (
            <ol className="panel divide-y divide-slate-200">
              {plan.map((item, i) => (
                <li key={item.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-3">
                      <span className="w-5 shrink-0 font-mono text-xs text-slate-500">{i + 1}</span>
                      <Link href={item.href} className="text-carbon hover:underline">
                        {item.title}
                      </Link>
                    </p>
                    <p className="ml-8 mt-0.5 text-xs text-slate-600">
                      <span className="font-mono text-slate-500">{PLAN_CATEGORIES[item.category]}</span> · {item.reason}
                    </p>
                  </div>
                  {item.taskId ? (
                    <div className="ml-8 sm:ml-0">
                      <ActionButton action={setTaskDoneAction} hidden={{ id: item.taskId }} label="Completar" />
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Sin prioridades para hoy.</Empty>
          )}
        </Section>

        <Section title={`Alertas · ${alertList.length}`}>
          {alertList.length ? (
            <ul className="panel max-h-[32rem] divide-y divide-slate-200 overflow-y-auto">
              {alertList.slice(0, 25).map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="flex gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${a.level === "critical" ? "bg-carbon" : a.level === "warning" ? "bg-slate-400" : "bg-slate-200"}`}
                    />
                    <span className="min-w-0">
                      <span className="block font-mono text-[0.7rem] uppercase tracking-wide text-slate-500">
                        {a.kind}
                        {a.level === "critical" ? " · urgente" : ""}
                      </span>
                      <span className="block truncate text-sm text-carbon">{a.title}</span>
                      <span className="block text-xs text-slate-600">{a.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Sin alertas.</Empty>
          )}
        </Section>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Oportunidades a priorizar" action={<Link href={`${B}/opportunities`} className="font-mono text-xs text-slate-600 hover:text-carbon">tabla →</Link>}>
          {priorities.length ? (
            <ul className="panel divide-y divide-slate-200">
              {priorities.map((o) => (
                <li key={o.id}>
                  <Link href={oppHref(o.id)} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-carbon">{oppLabel(o)}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2">
                        <StatusBadge status={o.status} />
                        <PriorityTag priority={o.priority} />
                      </span>
                    </span>
                    <span className="shrink-0 text-right font-mono text-lg text-carbon" title="Score">
                      {scores.get(o.id)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Aún no hay oportunidades cualificadas.</Empty>
          )}
        </Section>

        <Section title="Funnel" action={<Link href={`${B}/analytics`} className="font-mono text-xs text-slate-600 hover:text-carbon">analytics →</Link>}>
          <div className="panel space-y-2 p-4">
            {FUNNEL_STEPS.map(([key, label], i) => {
              const prev = i ? f[FUNNEL_STEPS[i - 1][0]] : null;
              return <BarRow key={key} label={label} value={f[key]} max={f.opportunities} detail={prev !== null ? pct(prev ? f[key] / prev : null) : undefined} />;
            })}
            <p className="pt-2 text-xs text-slate-600">
              Mejor canal:{" "}
              {bestSource ? (
                <span className="text-carbon">
                  {bestSource.label} · {bestSource.interviews}/{bestSource.applications} candidaturas con entrevista ({pct(bestSource.conversion)})
                </span>
              ) : (
                "Insufficient data (mínimo 5 candidaturas por fuente)"
              )}
            </p>
          </div>
        </Section>
      </div>

      <div className="grid gap-10 lg:grid-cols-3">
        <Section title="Entrevistas a preparar">
          {upcoming.length ? (
            <ul className="panel divide-y divide-slate-200">
              {upcoming.map((i) => {
                const o = opps.get(i.opportunityId);
                return (
                  <li key={i.id}>
                    <Link href={`${B}/interviews/${i.id}`} className="block px-4 py-2.5 hover:bg-slate-50">
                      <span className="block text-sm text-carbon">{o ? oppLabel(o) : "—"}</span>
                      <span className="block text-xs text-slate-600">
                        {INTERVIEW_KIND_LABEL[i.kind]} · {formatDateTime(i.scheduledAt, tz)} ({relativeDay(dateIn(i.scheduledAt!, tz), s.today)}) · prep {i.prepDone}/{i.prepTotal}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>Sin entrevistas programadas.</Empty>
          )}
        </Section>

        <Section title="Con quién contactar" action={<Link href={`${B}/networking`} className="font-mono text-xs text-slate-600 hover:text-carbon">networking →</Link>}>
          {toContact.length ? (
            <ul className="panel divide-y divide-slate-200">
              {toContact.map((c) => (
                <li key={c.id}>
                  <Link href={`${B}/contacts/${c.id}`} className="block px-4 py-2.5 hover:bg-slate-50">
                    <span className="block text-sm text-carbon">
                      {c.name}
                      {c.companyName ? <span className="text-slate-500"> · {c.companyName}</span> : null}
                    </span>
                    <span className="block text-xs text-slate-600">
                      {c.status === "to_contact" ? "Primer mensaje pendiente" : `Follow-up ${relativeDay(c.nextFollowUpAt, s.today)}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nadie pendiente.</Empty>
          )}
        </Section>

        <Section title="Actividad reciente">
          {activity.length ? (
            <ul className="panel divide-y divide-slate-200">
              {activity.map(({ a, title, companyName, contactName }) => (
                <li key={a.id} className="px-4 py-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <Badge>{ACTIVITY_LABEL[a.type]}</Badge>
                    <span className="font-mono text-[0.7rem] text-slate-500">{relativeDay(dateIn(a.occurredAt, tz), s.today)}</span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-slate-700">
                    {a.opportunityId ? (
                      <Link href={oppHref(a.opportunityId)} className="hover:underline">
                        {companyName ? `${companyName} · ${title}` : title}
                      </Link>
                    ) : (
                      contactName ?? a.summary
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Sin actividad todavía.</Empty>
          )}
        </Section>
      </div>
    </div>
  );
}

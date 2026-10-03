import { TaskFields, TaskList } from "@/components/admin/job-search/lists";
import { PageHeader, Section, Tabs } from "@/components/admin/job-search/ui";
import { addDays, weekStart } from "@/lib/job-search/dates";
import * as repo from "@/lib/job-search/repository";
import { db, getSnapshot } from "@/lib/job-search/server";

export const metadata = { title: "Tasks" };

const VIEWS = [
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
  ["week", "This Week"],
  ["overdue", "Overdue"],
  ["completed", "Completed"],
  ["all", "Abiertas"],
] as const;
type View = (typeof VIEWS)[number][0];

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const view: View = VIEWS.some(([k]) => k === sp.view) ? (sp.view as View) : "today";
  const [s, rows] = await Promise.all([getSnapshot(), repo.listTasks(db)]);
  const today = s.today;
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(weekStart(today), 6);

  const tasks = rows.map(({ task, opportunityTitle, companyName, contactName }) => ({
    ...task,
    context: task.opportunityId
      ? { label: companyName ? `${companyName} · ${opportunityTitle}` : (opportunityTitle ?? ""), href: `/admin/job-search/opportunities/${task.opportunityId}?tab=tasks` }
      : task.contactId
        ? { label: contactName ?? "Contacto", href: `/admin/job-search/contacts/${task.contactId}` }
        : null,
  }));
  const open = tasks.filter((t) => t.status === "open");
  const filters: Record<View, (t: (typeof tasks)[number]) => boolean> = {
    // "Today" incluye lo vencido: es lo que hay que hacer hoy.
    today: (t) => t.status === "open" && !!t.dueDate && t.dueDate <= today,
    tomorrow: (t) => t.status === "open" && t.dueDate === tomorrow,
    week: (t) => t.status === "open" && !!t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd,
    overdue: (t) => t.status === "open" && !!t.dueDate && t.dueDate < today,
    completed: (t) => t.status === "done",
    all: (t) => t.status === "open",
  };
  const list = tasks.filter(filters[view]);
  if (view === "completed") list.sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));

  return (
    <div className="space-y-6">
      <PageHeader title="Tasks" count={open.length} description="Las tareas automáticas (follow-ups, preparación de entrevistas, thank-you) aparecen aquí junto con las manuales." />
      <Tabs
        current={view}
        tabs={VIEWS.map(([key, label]) => ({ key, label, href: `/admin/job-search/tasks?view=${key}`, count: key === "completed" ? undefined : tasks.filter(filters[key]).length }))}
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <TaskList tasks={list.slice(0, 200)} today={today} showContext />
        <Section title="Nueva tarea">
          <div className="panel p-4">
            <TaskFields today={today} />
          </div>
        </Section>
      </div>
    </div>
  );
}

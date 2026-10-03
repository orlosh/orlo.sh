import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { Select, TextArea, TextField } from "@/components/admin/fields";
import type { jobActivities, jobNotes, jobTasks } from "@/db/schema";
import { addNoteAction, deleteNoteAction, deleteTaskAction, saveTaskAction, setTaskDoneAction } from "@/lib/job-search/actions";
import { dateIn, formatDay, relativeDay } from "@/lib/job-search/dates";
import { ACTIVITY_LABEL, OPTIONS, PRIORITY_LABEL, TASK_KIND_LABEL } from "@/lib/job-search/labels";
import { ActionButton } from "./ActionButton";
import { Badge, Empty } from "./ui";

/** Listas compartidas por los detalles de oportunidad, contacto, empresa y entrevista. */

type Task = typeof jobTasks.$inferSelect & { context?: { label: string; href: string } | null };

export function TaskList({ tasks, today, showContext = false }: { tasks: Task[]; today: string; showContext?: boolean }) {
  if (!tasks.length) return <Empty>Sin tareas.</Empty>;
  return (
    <ul className="panel divide-y divide-slate-200">
      {tasks.map((t) => {
        const overdue = t.status === "open" && t.dueDate && t.dueDate < today;
        return (
          <li key={t.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <ActionButton
                action={setTaskDoneAction}
                hidden={{ id: t.id, done: t.status === "done" ? "false" : "true" }}
                variant="link"
                ariaLabel={t.status === "done" ? `Reabrir: ${t.title}` : `Completar: ${t.title}`}
                label={
                  <span aria-hidden="true" className={`flex size-4 items-center justify-center rounded border ${t.status === "done" ? "border-carbon bg-carbon text-[0.6rem] text-white" : "border-slate-300 bg-white"}`}>
                    {t.status === "done" ? "✓" : ""}
                  </span>
                }
              />
              <div className="min-w-0">
                <p className={`text-sm ${t.status === "open" ? "text-carbon" : "text-slate-500 line-through"}`}>{t.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[0.7rem] text-slate-500">
                  <span>{TASK_KIND_LABEL[t.kind]}</span>
                  <span>· {PRIORITY_LABEL[t.priority]}</span>
                  {t.dueDate ? <span className={overdue ? "font-semibold text-carbon" : ""}>· {overdue ? "vencida " : ""}{relativeDay(t.dueDate, today)} ({formatDay(t.dueDate)})</span> : null}
                  {t.origin !== "manual" ? <span>· auto</span> : null}
                  {t.status === "cancelled" ? <span>· cancelada</span> : null}
                  {showContext && t.context ? (
                    <Link href={t.context.href} className="link">
                      {t.context.label}
                    </Link>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="ml-10 flex items-center gap-1 sm:ml-0">
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">Editar</summary>
                <div className="panel absolute right-0 z-20 mt-2 w-[min(28rem,calc(100vw-2rem))] p-4 shadow-lg">
                  <TaskFields task={t} />
                </div>
              </details>
              <ActionButton action={deleteTaskAction} hidden={{ id: t.id }} variant="link" label="Eliminar" confirmText="¿Eliminar la tarea?" />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Formulario de tarea; con `task`, edita; con `refs`, crea vinculada. */
export function TaskFields({ task, refs = {}, today }: { task?: Task; refs?: Record<string, string>; today?: string }) {
  const hidden = task
    ? { id: task.id, opportunityId: task.opportunityId ?? "", contactId: task.contactId ?? "", interviewId: task.interviewId ?? "" }
    : refs;
  return (
    <ActionForm action={saveTaskAction} hidden={hidden} submitLabel={task ? "Guardar" : "Añadir tarea"} className="space-y-4">
      <TextField name="title" label="Tarea" defaultValue={task?.title} required />
      <div className="grid gap-4 sm:grid-cols-3">
        <Select name="kind" label="Tipo" options={OPTIONS.taskKind()} defaultValue={task?.kind ?? "other"} />
        <TextField name="dueDate" label="Fecha" type="date" defaultValue={task?.dueDate ?? today} />
        <Select name="priority" label="Prioridad" options={OPTIONS.priority()} defaultValue={task?.priority ?? "medium"} />
      </div>
      <TextArea name="notes" label="Notas" rows={2} defaultValue={task?.notes} />
    </ActionForm>
  );
}

type Activity = typeof jobActivities.$inferSelect;

export function Timeline({ activities, timezone, today }: { activities: Activity[]; timezone: string; today: string }) {
  if (!activities.length) return <Empty>Sin actividad.</Empty>;
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {activities.map((a) => {
        const day = dateIn(a.occurredAt, timezone);
        return (
          <li key={a.id} className="relative">
            <span aria-hidden="true" className={`absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full ring-4 ring-background-light ${a.type === "offer" ? "bg-primary" : "bg-carbon"}`} />
            <p className="flex flex-wrap items-center gap-2">
              <Badge>{ACTIVITY_LABEL[a.type]}</Badge>
              <time dateTime={a.occurredAt.toISOString()} className="font-mono text-[0.7rem] text-slate-500">
                {formatDay(day)} · {relativeDay(day, today)}
              </time>
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{a.summary}</p>
          </li>
        );
      })}
    </ol>
  );
}

type Note = typeof jobNotes.$inferSelect;

export function Notes({ notes, refs, timezone, today }: { notes: Note[]; refs: Record<string, string>; timezone: string; today: string }) {
  return (
    <div className="space-y-4">
      <ActionForm action={addNoteAction} hidden={refs} submitLabel="Añadir nota" className="space-y-3">
        <TextArea name="body" label="Nueva nota" rows={3} />
      </ActionForm>
      {notes.length ? (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="panel p-4">
              <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{n.body}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="font-mono text-[0.7rem] text-slate-500">{relativeDay(dateIn(n.createdAt, timezone), today)}</span>
                <ActionButton action={deleteNoteAction} hidden={{ id: n.id }} variant="link" label="Eliminar" confirmText="¿Eliminar la nota?" />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

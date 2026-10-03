import { ActionForm } from "@/components/admin/ActionForm";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { TextArea, TextField } from "@/components/admin/fields";
import { Empty, PageHeader, Section } from "@/components/admin/job-search/ui";
import type { jobStarStories } from "@/db/schema";
import { deleteStarStoryAction, saveStarStoryAction } from "@/lib/job-search/actions";
import { listStarStories } from "@/lib/job-search/repository";
import { db } from "@/lib/job-search/server";

export const metadata = { title: "Historias STAR" };

function StoryFields({ s }: { s?: typeof jobStarStories.$inferSelect }) {
  return (
    <>
      <TextField name="title" label="Título" defaultValue={s?.title} required />
      <TextField name="tags" label="Etiquetas" defaultValue={s?.tags} hint="Liderazgo, conflicto, incidente…" />
      <TextArea name="situation" label="Situación" rows={3} defaultValue={s?.situation} />
      <TextArea name="task" label="Tarea" rows={3} defaultValue={s?.task} />
      <TextArea name="action" label="Acción" rows={4} defaultValue={s?.action} />
      <TextArea name="result" label="Resultado" rows={3} defaultValue={s?.result} hint="Con cifras solo si son reales." />
    </>
  );
}

export default async function StoriesPage() {
  const stories = await listStarStories(db);
  return (
    <div className="space-y-8">
      <PageHeader title="Historias STAR" count={stories.length} description="Historias reales en formato STAR (situación, tarea, acción, resultado), reutilizables en cada preparación." />
      {stories.length ? (
        <ul className="space-y-3">
          {stories.map((s) => (
            <li key={s.id} className="panel p-4">
              <details>
                <summary className="cursor-pointer text-carbon">
                  {s.title}
                  {s.tags ? <span className="ml-2 font-mono text-xs text-slate-500">{s.tags}</span> : null}
                </summary>
                <div className="mt-4 space-y-3">
                  <ActionForm action={saveStarStoryAction} hidden={{ id: s.id }} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <StoryFields s={s} />
                  </ActionForm>
                  <DeleteButton action={deleteStarStoryAction} hidden={{ id: s.id }} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Sin historias todavía.</Empty>
      )}
      <Section title="Nueva historia">
        <ActionForm action={saveStarStoryAction} submitLabel="Añadir" className="panel grid gap-4 p-4 md:grid-cols-2">
          <StoryFields />
        </ActionForm>
      </Section>
    </div>
  );
}

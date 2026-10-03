import { Kanban } from "@/components/admin/job-search/Kanban";
import { PageHeader } from "@/components/admin/job-search/ui";
import { scoreValues } from "@/lib/job-search/engine";
import { getWorkspace } from "@/lib/job-search/server";
import { kanbanCards } from "@/lib/job-search/views";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const { snapshot, engine } = await getWorkspace();
  const cards = kanbanCards(snapshot, scoreValues(engine));
  return (
    <div className="space-y-6">
      <PageHeader title="Pipeline" count={cards.length} description="Cada cambio de estado queda registrado en el historial y dispara sus automatizaciones (follow-ups, actividad, cierre de tareas)." />
      <Kanban cards={cards} today={snapshot.today} />
    </div>
  );
}

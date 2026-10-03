import { ActionForm } from "@/components/admin/ActionForm";
import { Select, TextArea, TextField } from "@/components/admin/fields";
import type { jobInterviews } from "@/db/schema";
import { saveInterviewAction } from "@/lib/job-search/actions";
import { utcToZonedInput } from "@/lib/job-search/dates";
import { OPTIONS } from "@/lib/job-search/labels";

type Opt = { value: string; label: string };

/** Datos de la entrevista (no la preparación). La hora se edita en la zona de la entrevista. */
export function InterviewForm({ row, opportunities, contacts, timezone }: { row?: typeof jobInterviews.$inferSelect; opportunities: Opt[]; contacts: Opt[]; timezone: string }) {
  const tz = row?.timezone ?? timezone;
  return (
    <ActionForm action={saveInterviewAction} hidden={row ? { id: row.id } : {}} submitLabel={row ? "Guardar" : "Programar"} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Select name="opportunityId" label="Oportunidad (empresa · puesto)" options={opportunities} defaultValue={row?.opportunityId} />
        </div>
        <Select name="kind" label="Tipo / etapa" options={OPTIONS.interviewKind()} defaultValue={row?.kind ?? "recruiter_screen"} />
        <TextField name="round" label="Ronda" type="number" defaultValue={row?.round} />
        <TextField name="scheduledLocal" label="Fecha y hora" type="datetime-local" defaultValue={utcToZonedInput(row?.scheduledAt, tz)} />
        <TextField name="timezone" label="Timezone" defaultValue={tz} hint="IANA, p. ej. America/New_York" />
        <TextField name="durationMinutes" label="Duración (min)" type="number" defaultValue={row?.durationMinutes ?? 45} />
        <Select name="format" label="Formato" options={OPTIONS.interviewFormat("—")} defaultValue={row?.format ?? "video"} />
        <TextField name="meetingUrl" label="Meeting link" type="url" defaultValue={row?.meetingUrl} />
        <Select name="interviewerContactId" label="Interviewer (contacto)" options={[{ value: "", label: "—" }, ...contacts]} defaultValue={row?.interviewerContactId} />
        <TextField name="interviewerName" label="Interviewer (nombre)" defaultValue={row?.interviewerName} />
        <Select name="outcome" label="Resultado" options={OPTIONS.interviewOutcome()} defaultValue={row?.outcome ?? "pending"} />
      </div>
      <TextArea name="topics" label="Temas" rows={2} defaultValue={row?.topics} />
      <TextArea name="notes" label="Notas / feedback" rows={4} defaultValue={row?.notes} />
      <TextField name="nextAction" label="Siguiente acción" defaultValue={row?.nextAction} />
    </ActionForm>
  );
}

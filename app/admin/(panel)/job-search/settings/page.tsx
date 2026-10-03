import { ActionForm } from "@/components/admin/ActionForm";
import { Select, TextField } from "@/components/admin/fields";
import { PageHeader } from "@/components/admin/job-search/ui";
import { saveGoalAction } from "@/lib/job-search/actions";
import { OPTIONS, WORKPLACE_LABEL } from "@/lib/job-search/labels";
import { WORKPLACES } from "@/lib/job-search/enums";
import { getGoal } from "@/lib/job-search/repository";
import { db } from "@/lib/job-search/server";

export const metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const { row, goal } = await getGoal(db);
  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader title="Objetivo y reglas" description="El objetivo fija el contador Day X / 30. Las preferencias alimentan el score; las reglas, los follow-ups automáticos." />
      {!row ? <p className="text-sm text-slate-600">Aún no has guardado el objetivo: se usan los valores por defecto con inicio hoy.</p> : null}
      <ActionForm action={saveGoalAction} className="space-y-8">
        <fieldset className="grid gap-5 md:grid-cols-3">
          <legend className="label mb-3">Objetivo</legend>
          <TextField name="startDate" label="Fecha de inicio" type="date" defaultValue={goal.startDate} required />
          <TextField name="durationDays" label="Duración (días)" type="number" defaultValue={goal.durationDays} />
          <TextField name="timezone" label="Zona horaria" defaultValue={goal.timezone} hint="IANA (p. ej., Europe/Berlin). Decide qué es “hoy”." />
          <TextField name="weeklyApplicationTarget" label="Candidaturas por semana" type="number" defaultValue={goal.weeklyApplicationTarget} />
        </fieldset>
        <fieldset className="grid gap-5 md:grid-cols-3">
          <legend className="label mb-3">Preferencias (score)</legend>
          <div className="md:col-span-2">
            <TextField name="targetRoles" label="Roles objetivo" defaultValue={goal.targetRoles.join(", ")} hint="Separados por comas: se buscan en el título de cada oferta." />
          </div>
          <Select name="targetSeniority" label="Seniority objetivo" options={OPTIONS.seniority("—")} defaultValue={goal.targetSeniority} />
          <TextField name="minSalary" label="Salario mínimo (anual)" type="number" defaultValue={goal.minSalary} />
          <TextField name="currency" label="Moneda" defaultValue={goal.currency} placeholder="EUR" />
          <TextField name="preferredLocations" label="Ubicaciones aceptables" defaultValue={goal.preferredLocations.join(", ")} hint="Separadas por comas." />
          <fieldset className="space-y-2 md:col-span-3">
            <legend className="field-label">Modalidades aceptables</legend>
            <div className="flex flex-wrap gap-4">
              {WORKPLACES.map((w) => (
                <label key={w} className="flex items-center gap-2 text-sm text-slate-800">
                  <input type="checkbox" name="preferredWorkplaces" value={w} defaultChecked={goal.preferredWorkplaces.includes(w)} className="size-4 accent-primary" />
                  {WORKPLACE_LABEL[w]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="md:col-span-3">
            <TextField
              name="extraSkills"
              label="Habilidades adicionales"
              defaultValue={goal.extraSkills.join(", ")}
              hint="Solo habilidades reales que no estén ya en Stack. Se usan en el matching con las Job Descriptions."
            />
          </div>
        </fieldset>
        <fieldset className="grid gap-5 md:grid-cols-4">
          <legend className="label mb-3">Reglas de follow-up (días laborables)</legend>
          <TextField name="followupApplicationDays" label="Tras aplicar" type="number" defaultValue={goal.followupApplicationDays} />
          <TextField name="followupRecruiterDays" label="Tras contactar a un recruiter" type="number" defaultValue={goal.followupRecruiterDays} />
          <TextField name="followupReferralDays" label="Tras pedir un referral" type="number" defaultValue={goal.followupReferralDays} />
          <TextField name="staleDays" label="Días hasta “se enfría”" type="number" defaultValue={goal.staleDays} hint="Días naturales sin actividad." />
        </fieldset>
        <p className="text-xs text-slate-600">El thank-you tras una entrevista se programa siempre para el día siguiente (24 h).</p>
      </ActionForm>
    </div>
  );
}

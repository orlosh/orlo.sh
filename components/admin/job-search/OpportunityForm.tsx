import { ActionForm } from "@/components/admin/ActionForm";
import { Select, TextArea, TextField } from "@/components/admin/fields";
import type { jobOpportunities } from "@/db/schema";
import { saveOpportunityAction } from "@/lib/job-search/actions";
import { OPTIONS } from "@/lib/job-search/labels";

type Row = typeof jobOpportunities.$inferSelect;

const FIT = [{ value: "", label: "Automático" }, ...[0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}/5` }))];

/** Formulario completo de una oportunidad (alta y edición). */
export function OpportunityForm({ row, companyName, companies }: { row?: Row; companyName?: string | null; companies: string[] }) {
  return (
    <ActionForm action={saveOpportunityAction} hidden={row ? { id: row.id } : {}}>
      <datalist id="js-companies">
        {companies.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <fieldset className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <legend className="label mb-3">Puesto</legend>
        <CompanyField defaultValue={companyName} />
        <TextField name="title" label="Puesto" defaultValue={row?.title} required />
        <TextField name="url" label="URL" type="url" defaultValue={row?.url} placeholder="https://…" />
        <Select name="source" label="Fuente" options={OPTIONS.source()} defaultValue={row?.source ?? "other"} />
        <TextField name="location" label="Ubicación" defaultValue={row?.location} />
        <Select name="workplace" label="Modalidad" options={OPTIONS.workplace("—")} defaultValue={row?.workplace} />
      </fieldset>
      <fieldset className="grid grid-cols-1 gap-5 md:grid-cols-4">
        <legend className="label mb-3">Salario</legend>
        <TextField name="salaryMin" label="Mínimo" type="number" defaultValue={row?.salaryMin} />
        <TextField name="salaryMax" label="Máximo" type="number" defaultValue={row?.salaryMax} />
        <TextField name="salaryCurrency" label="Moneda" defaultValue={row?.salaryCurrency} placeholder="EUR" />
        <TextField name="salaryText" label="Detalle" defaultValue={row?.salaryText} placeholder="+ bonus, equity…" />
      </fieldset>
      <fieldset className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <legend className="label mb-3">Proceso</legend>
        <Select name="status" label="Estado" options={OPTIONS.status()} defaultValue={row?.status ?? "discovered"} hint="Cambiarlo aquí también dispara las automatizaciones." />
        <Select name="priority" label="Prioridad" options={OPTIONS.priority()} defaultValue={row?.priority ?? "medium"} />
        <Select name="outcome" label="Resultado" options={OPTIONS.outcome("—")} defaultValue={row?.outcome} />
        <TextField name="postedAt" label="Fecha de publicación" type="date" defaultValue={row?.postedAt} />
        <TextField name="discoveredAt" label="Fecha en que la guardaste" type="date" defaultValue={row?.discoveredAt} hint="Vacío = hoy." />
        <TextField name="appliedAt" label="Fecha de aplicación" type="date" defaultValue={row?.appliedAt} />
        <TextField name="deadline" label="Cierre de candidaturas" type="date" defaultValue={row?.deadline} />
        <TextField name="offerDeadline" label="Plazo para responder a la oferta" type="date" defaultValue={row?.offerDeadline} />
        <TextField name="nextFollowUpAt" label="Próximo seguimiento" type="date" defaultValue={row?.nextFollowUpAt} />
        <TextField name="nextAction" label="Próxima acción" defaultValue={row?.nextAction} />
        <TextField name="nextActionAt" label="Fecha de la próxima acción" type="date" defaultValue={row?.nextActionAt} />
        <TextField name="discardReason" label="Motivo de descarte" defaultValue={row?.discardReason} />
      </fieldset>
      <fieldset className="grid grid-cols-1 gap-5 md:grid-cols-4">
        <legend className="label mb-3">Puntuación</legend>
        <Select name="roleFit" label="Encaje con el rol (manual)" options={FIT} defaultValue={row?.roleFit?.toString()} />
        <Select name="seniorityFit" label="Encaje de nivel (manual)" options={FIT} defaultValue={row?.seniorityFit?.toString()} />
        <TextField name="scoreOverride" label="Puntuación manual (0-100)" type="number" defaultValue={row?.scoreOverride} hint="Vacío = la calculada." />
        <TextField name="scoreOverrideReason" label="Motivo de la puntuación manual" defaultValue={row?.scoreOverrideReason} />
      </fieldset>
      <TextArea name="description" label="Descripción de la oferta" rows={10} defaultValue={row?.description} hint="Pega el texto completo: es la base del análisis y de la comparación con tu CV." />
      <TextArea name="notes" label="Notas rápidas" rows={3} defaultValue={row?.notes} />
    </ActionForm>
  );
}

function CompanyField({ defaultValue }: { defaultValue?: string | null }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="js-company" className="field-label block">
        Empresa
      </label>
      <input id="js-company" name="companyName" list="js-companies" defaultValue={defaultValue ?? ""} className="field" autoComplete="off" />
      <p className="text-xs text-slate-600">Si no existe, se crea en Companies.</p>
    </div>
  );
}

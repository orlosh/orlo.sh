import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { Checkbox, MarkdownField, Select, TechnologyPicker, TextArea, TextField } from "@/components/admin/fields";
import { deleteExperienceAction, saveExperience } from "@/lib/admin/actions";
import { editorId } from "@/lib/admin/params";
import { getExperienceRow, listTechnologyOptions } from "@/lib/admin/queries";

export const metadata = { title: "Editar experiencia" };

const TYPES = [
  { value: "", label: "—" },
  { value: "full_time", label: "Jornada completa" },
  { value: "part_time", label: "Media jornada" },
  { value: "contract", label: "Contrato" },
  { value: "freelance", label: "Freelance" },
  { value: "internship", label: "Prácticas" },
];

export default async function ExperienceEditor({ params }: { params: Promise<{ id: string }> }) {
  const id = await editorId(params);
  const [row, groups] = await Promise.all([id ? getExperienceRow(id) : null, listTechnologyOptions()]);
  if (id && !row) notFound();

  return (
    <div className="max-w-3xl">
      <Link href="/admin/experience" className="font-mono text-xs text-slate-600 hover:text-carbon">
        ← experiencia
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-carbon">{row ? `${row.role} · ${row.company}` : "Nueva experiencia"}</h1>
      <div className="mt-8">
        <ActionForm action={saveExperience} hidden={id ? { id } : {}}>
          <div className="grid gap-5 md:grid-cols-2">
            <TextField name="company" label="Empresa (privado)" defaultValue={row?.company} required hint="Solo visible en /admin." />
            <TextField
              name="publicCompany"
              label="Empresa en el sitio público"
              defaultValue={row?.publicCompany}
              hint="Vacío = no se muestra ninguna empresa."
            />
            <TextField name="role" label="Puesto" defaultValue={row?.role} required />
            <TextField name="client" label="Cliente (privado)" defaultValue={row?.client} />
            <TextField name="location" label="Ubicación" defaultValue={row?.location} />
            <TextField name="startDate" label="Inicio" type="date" defaultValue={row?.startDate} required />
            <TextField name="endDate" label="Fin" type="date" defaultValue={row?.endDate} hint="Vacío = puesto actual." />
            <Select name="employmentType" label="Tipo de empleo" options={TYPES} defaultValue={row?.employmentType} />
          </div>
          <MarkdownField name="description" label="Descripción" defaultValue={row?.description} rows={5} />
          <TextArea
            name="highlights"
            label="Logros / responsabilidades"
            hint="Uno por línea."
            rows={6}
            defaultValue={row?.highlights.map((h) => h.body).join("\n")}
          />
          <TechnologyPicker groups={groups} selected={row?.technologies.map((t) => t.technologyId) ?? []} />
          <Checkbox name="visible" label="Visible en el sitio público" defaultChecked={row?.visible ?? true} />
        </ActionForm>
      </div>
      {id ? (
        <div className="mt-10 border-t border-border-dark/15 pt-6">
          <DeleteButton action={deleteExperienceAction} hidden={{ id }} />
        </div>
      ) : null}
    </div>
  );
}

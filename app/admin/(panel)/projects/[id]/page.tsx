import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { Checkbox, MarkdownField, Select, TechnologyPicker, TextArea, TextField } from "@/components/admin/fields";
import { deleteProjectAction, saveProject } from "@/lib/admin/actions";
import { editorId } from "@/lib/admin/params";
import { getProjectRow, listTechnologyOptions } from "@/lib/admin/queries";

export const metadata = { title: "Editar proyecto" };

const STATUS = [
  { value: "", label: "— sin indicar" },
  { value: "in_progress", label: "En desarrollo" },
  { value: "active", label: "Activo" },
  { value: "completed", label: "Completado" },
  { value: "archived", label: "Archivado" },
];

const SECTIONS = [
  ["overview", "Overview"],
  ["architecture", "Arquitectura"],
  ["infrastructure", "Infraestructura"],
  ["deployment", "Despliegue"],
  ["security", "Seguridad"],
  ["challenges", "Retos"],
  ["decisions", "Decisiones"],
  ["results", "Resultado"],
  ["lessons", "Lecciones aprendidas"],
] as const;

const DIAGRAM_HINT =
  'JSON: {"nodes":[{"id":"web","label":"Web","detail":"Next.js","lane":0,"column":0}],"edges":[{"from":"web","to":"db"}]}. lane = fila, column = columna. Vacío = sin diagrama.';

export default async function ProjectEditor({ params }: { params: Promise<{ id: string }> }) {
  const id = await editorId(params);
  const [row, groups] = await Promise.all([id ? getProjectRow(id) : null, listTechnologyOptions()]);
  if (id && !row) notFound();

  return (
    <div className="max-w-3xl">
      <Link href="/admin/projects" className="font-mono text-xs text-slate-600 hover:text-carbon">
        ← proyectos
      </Link>
      <div className="mt-3 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold text-carbon">{row?.title ?? "Nuevo proyecto"}</h1>
        {row?.published ? (
          <Link href={`/projects/${row.slug}`} className="link text-sm">
            ver publicado ↗
          </Link>
        ) : null}
      </div>
      <div className="mt-8">
        <ActionForm action={saveProject} hidden={id ? { id } : {}}>
          <div className="grid gap-5 md:grid-cols-2">
            <TextField name="title" label="Título" defaultValue={row?.title} required />
            <TextField name="slug" label="Slug" defaultValue={row?.slug} required hint="URL: /projects/<slug>" />
            <Select name="status" label="Estado" options={STATUS} defaultValue={row?.status} />
            <TextField name="position" label="Orden" type="number" defaultValue={row?.position ?? 0} />
            <TextField name="repositoryUrl" label="Repositorio" defaultValue={row?.repositoryUrl} placeholder="https://" />
            <TextField name="liveUrl" label="URL en producción" defaultValue={row?.liveUrl} placeholder="https://" />
          </div>
          <TextArea name="summary" label="Resumen (una frase)" rows={2} defaultValue={row?.summary} />
          <div className="flex flex-wrap gap-6">
            <Checkbox name="published" label="Publicado" defaultChecked={row?.published} />
            <Checkbox name="featured" label="Destacado en la portada" defaultChecked={row?.featured} />
          </div>
          <TechnologyPicker groups={groups} selected={row?.technologies.map((t) => t.technologyId) ?? []} />

          <fieldset className="space-y-5 border-t border-border-dark/15 pt-6">
            <legend className="label">Caso de estudio · las secciones vacías no se publican</legend>
            {SECTIONS.map(([key, label]) => (
              <MarkdownField key={key} name={key} label={label} defaultValue={row?.[key]} rows={6} />
            ))}
          </fieldset>

          <TextArea
            name="diagram"
            label="Diagrama de arquitectura"
            hint={DIAGRAM_HINT}
            rows={8}
            mono
            defaultValue={row?.diagram ? JSON.stringify(row.diagram, null, 2) : ""}
          />
          <TextArea
            name="images"
            label="Imágenes"
            hint="Una por línea: url | texto alternativo | pie (opcional)"
            rows={3}
            mono
            defaultValue={row?.images.map((i) => [i.url, i.alt, i.caption ?? ""].join(" | ")).join("\n")}
          />
        </ActionForm>
      </div>
      {id ? (
        <div className="mt-10 border-t border-border-dark/15 pt-6">
          <DeleteButton action={deleteProjectAction} hidden={{ id }} />
        </div>
      ) : null}
    </div>
  );
}

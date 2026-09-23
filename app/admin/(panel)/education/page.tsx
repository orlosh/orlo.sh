import { ActionForm } from "@/components/admin/ActionForm";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { Select, TextField } from "@/components/admin/fields";
import { deleteSimpleAction, saveSimple } from "@/lib/admin/actions";
import { listEducation, listLanguages } from "@/lib/admin/queries";

export const metadata = { title: "Formación" };

const KINDS = [
  { value: "formal", label: "Formación reglada" },
  { value: "certification", label: "Certificación" },
  { value: "course", label: "Curso" },
];

function EducationFields({ e }: { e?: Awaited<ReturnType<typeof listEducation>>[number] }) {
  return (
    <>
      <Select name="kind" label="Tipo" options={KINDS} defaultValue={e?.kind} />
      <TextField name="title" label="Título" defaultValue={e?.title} />
      <TextField name="institution" label="Institución" defaultValue={e?.institution} />
      <TextField name="startYear" label="Año inicio" type="number" defaultValue={e?.startYear} />
      <TextField name="endYear" label="Año fin" type="number" defaultValue={e?.endYear} />
      <TextField name="credentialUrl" label="URL credencial" defaultValue={e?.credentialUrl} />
      <TextField name="position" label="Orden" type="number" defaultValue={e?.position ?? 0} />
    </>
  );
}

export default async function EducationAdmin() {
  const [education, languages] = await Promise.all([listEducation(), listLanguages()]);
  return (
    <div className="max-w-4xl space-y-14">
      <section>
        <h1 className="text-2xl font-semibold text-carbon">Formación y certificaciones</h1>
        <ul className="mt-6 space-y-4">
          {education.map((e) => (
            <li key={e.id} className="panel p-4">
              <details>
                <summary className="cursor-pointer text-carbon">{e.title}</summary>
                <div className="mt-4 space-y-3">
                  <ActionForm action={saveSimple} hidden={{ entity: "education", id: e.id }} className="grid gap-4 md:grid-cols-3">
                    <EducationFields e={e} />
                  </ActionForm>
                  <DeleteButton action={deleteSimpleAction} hidden={{ entity: "education", id: e.id }} />
                </div>
              </details>
            </li>
          ))}
        </ul>
        <h2 className="label mt-8">Nueva entrada</h2>
        <div className="mt-3">
          <ActionForm action={saveSimple} hidden={{ entity: "education" }} submitLabel="Añadir" className="grid gap-4 md:grid-cols-3">
            <EducationFields />
          </ActionForm>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-carbon">Idiomas</h2>
        <ul className="mt-6 space-y-4">
          {languages.map((l) => (
            <li key={l.id} className="panel p-4">
              <ActionForm action={saveSimple} hidden={{ entity: "language", id: l.id }} className="grid gap-4 md:grid-cols-3">
                <TextField name="name" label="Idioma" defaultValue={l.name} />
                <TextField name="level" label="Nivel" defaultValue={l.level} hint="Vacío si no está definido." />
                <TextField name="position" label="Orden" type="number" defaultValue={l.position} />
              </ActionForm>
              <div className="mt-3">
                <DeleteButton action={deleteSimpleAction} hidden={{ entity: "language", id: l.id }} />
              </div>
            </li>
          ))}
        </ul>
        <h3 className="label mt-8">Nuevo idioma</h3>
        <div className="mt-3">
          <ActionForm action={saveSimple} hidden={{ entity: "language" }} submitLabel="Añadir" className="grid gap-4 md:grid-cols-3">
            <TextField name="name" label="Idioma" />
            <TextField name="level" label="Nivel" />
            <TextField name="position" label="Orden" type="number" defaultValue={languages.length} />
          </ActionForm>
        </div>
      </section>
    </div>
  );
}

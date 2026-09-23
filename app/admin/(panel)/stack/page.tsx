import { ActionForm } from "@/components/admin/ActionForm";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { Select, TextField } from "@/components/admin/fields";
import { deleteSimpleAction, saveSimple } from "@/lib/admin/actions";
import { listTechnologyOptions } from "@/lib/admin/queries";

export const metadata = { title: "Stack" };

export default async function StackAdmin() {
  const layers = await listTechnologyOptions();
  const layerOptions = layers.map((l) => ({ value: l.id, label: l.name }));
  return (
    <div className="max-w-4xl space-y-14">
      <div>
        <h1 className="text-2xl font-semibold text-carbon">Stack</h1>
        <p className="mt-2 text-sm text-slate-600">
          Capas y tecnologías. Los años de experiencia solo se muestran si se rellenan; nunca hay porcentajes.
        </p>
      </div>

      {layers.map((layer) => (
        <section key={layer.id} aria-labelledby={`l-${layer.id}`} className="space-y-4">
          <details className="panel p-4">
            <summary id={`l-${layer.id}`} className="cursor-pointer text-lg font-semibold text-carbon">
              {layer.name} <span className="font-mono text-xs font-normal text-slate-600">{layer.technologies.length} tecnologías</span>
            </summary>
            <div className="mt-4 space-y-3">
              <ActionForm action={saveSimple} hidden={{ entity: "technologyCategory", id: layer.id }} className="grid gap-4 md:grid-cols-4">
                <TextField name="name" label="Nombre de la capa" defaultValue={layer.name} />
                <TextField name="slug" label="Slug" defaultValue={layer.slug} />
                <TextField name="description" label="Descripción" defaultValue={layer.description} />
                <TextField name="position" label="Orden" type="number" defaultValue={layer.position} />
              </ActionForm>
              <DeleteButton
                action={deleteSimpleAction}
                hidden={{ entity: "technologyCategory", id: layer.id }}
                label="Eliminar capa"
                confirmText="Solo se puede eliminar una capa vacía. ¿Continuar?"
              />
            </div>
          </details>

          <ul className="divide-y divide-border-dark/15 border-y border-border-dark/15">
            {layer.technologies.map((t) => (
              <li key={t.id} className="py-3">
                <details>
                  <summary className="cursor-pointer text-sm text-carbon">
                    {t.name}
                    {t.yearsOfExperience ? <span className="ml-2 font-mono text-xs text-slate-600">{t.yearsOfExperience} a</span> : null}
                  </summary>
                  <div className="mt-3 space-y-3">
                    <ActionForm action={saveSimple} hidden={{ entity: "technology", id: t.id }} className="grid gap-4 md:grid-cols-3">
                      <TextField name="name" label="Nombre" defaultValue={t.name} />
                      <TextField name="slug" label="Slug" defaultValue={t.slug} />
                      <Select name="categoryId" label="Capa" options={layerOptions} defaultValue={t.categoryId} />
                      <TextField name="description" label="Descripción" defaultValue={t.description} />
                      <TextField name="yearsOfExperience" label="Años (opcional)" type="number" defaultValue={t.yearsOfExperience} />
                      <TextField name="position" label="Orden" type="number" defaultValue={t.position} />
                    </ActionForm>
                    <DeleteButton action={deleteSimpleAction} hidden={{ entity: "technology", id: t.id }} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="grid gap-10 md:grid-cols-2">
        <div>
          <h2 className="label">Nueva tecnología</h2>
          <div className="mt-3">
            <ActionForm action={saveSimple} hidden={{ entity: "technology" }} submitLabel="Añadir">
              <TextField name="name" label="Nombre" required />
              <TextField name="slug" label="Slug" hint="Vacío = se genera a partir del nombre." />
              <Select name="categoryId" label="Capa" options={layerOptions} />
              <TextField name="description" label="Descripción" />
              <TextField name="yearsOfExperience" label="Años (opcional)" type="number" />
            </ActionForm>
          </div>
        </div>
        <div>
          <h2 className="label">Nueva capa</h2>
          <div className="mt-3">
            <ActionForm action={saveSimple} hidden={{ entity: "technologyCategory" }} submitLabel="Añadir">
              <TextField name="name" label="Nombre" required />
              <TextField name="slug" label="Slug" hint="Vacío = se genera a partir del nombre." />
              <TextField name="description" label="Descripción" />
              <TextField name="position" label="Orden" type="number" defaultValue={layers.length} />
            </ActionForm>
          </div>
        </div>
      </section>
    </div>
  );
}

import { ActionForm } from "@/components/admin/ActionForm";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { Select, TextArea, TextField } from "@/components/admin/fields";
import { deleteSimpleAction, saveProfile, saveSimple } from "@/lib/admin/actions";
import { getProfileRow, listSocialLinks } from "@/lib/admin/queries";

export const metadata = { title: "Perfil" };

const KINDS = ["github", "linkedin", "email", "website", "other"].map((k) => ({ value: k, label: k }));

export default async function ProfileAdmin() {
  const [profile, links] = await Promise.all([getProfileRow(), listSocialLinks()]);
  return (
    <div className="max-w-3xl space-y-14">
      <section>
        <h1 className="text-2xl font-semibold text-carbon">Perfil</h1>
        <div className="mt-6">
          <ActionForm action={saveProfile}>
            <div className="grid gap-5 md:grid-cols-2">
              <TextField
                name="displayName"
                label="Marca pública"
                defaultValue={profile?.displayName}
                required
                hint="Lo que muestra el sitio. Nunca un nombre legal."
              />
              <TextField name="headline" label="Titular" defaultValue={profile?.headline} required />
              <TextField name="location" label="Ubicación" defaultValue={profile?.location} />
              <TextField
                name="contactEmail"
                label="Email público"
                type="email"
                defaultValue={profile?.contactEmail}
                hint="Vacío = no se publica ningún email."
              />
            </div>
            <TextArea name="summary" label="Resumen" rows={4} defaultValue={profile?.summary} />
          </ActionForm>
        </div>
      </section>

      <section aria-labelledby="links">
        <h2 id="links" className="text-xl font-semibold text-carbon">
          Enlaces
        </h2>
        <ul className="mt-6 space-y-6">
          {links.map((l) => (
            <li key={l.id} className="panel p-4">
              <ActionForm action={saveSimple} hidden={{ entity: "socialLink", id: l.id }} className="grid gap-4 md:grid-cols-4">
                <Select name="kind" label="Tipo" options={KINDS} defaultValue={l.kind} />
                <TextField name="label" label="Texto" defaultValue={l.label} />
                <TextField name="url" label="URL" defaultValue={l.url} />
                <TextField name="position" label="Orden" type="number" defaultValue={l.position} />
              </ActionForm>
              <div className="mt-3">
                <DeleteButton action={deleteSimpleAction} hidden={{ entity: "socialLink", id: l.id }} />
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <h3 className="label">Nuevo enlace</h3>
          <div className="mt-3">
            <ActionForm action={saveSimple} hidden={{ entity: "socialLink" }} submitLabel="Añadir" className="grid gap-4 md:grid-cols-4">
              <Select name="kind" label="Tipo" options={KINDS} />
              <TextField name="label" label="Texto" />
              <TextField name="url" label="URL" placeholder="https://" />
              <TextField name="position" label="Orden" type="number" defaultValue={links.length} />
            </ActionForm>
          </div>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { Checkbox, MarkdownField, TextArea, TextField } from "@/components/admin/fields";
import { deleteNoteAction, saveNote } from "@/lib/admin/actions";
import { editorId } from "@/lib/admin/params";
import { getNoteRow } from "@/lib/admin/queries";

export const metadata = { title: "Editar nota" };

export default async function NoteEditor({ params }: { params: Promise<{ id: string }> }) {
  const id = await editorId(params);
  const row = id ? await getNoteRow(id) : null;
  if (id && !row) notFound();

  return (
    <div className="max-w-3xl">
      <Link href="/admin/notes" className="font-mono text-xs text-slate-600 hover:text-carbon">
        ← notas
      </Link>
      <div className="mt-3 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold text-carbon">{row?.title ?? "Nueva nota"}</h1>
        {row?.published ? (
          <Link href={`/notes/${row.slug}`} className="link text-sm">
            ver publicada ↗
          </Link>
        ) : null}
      </div>
      {row?.publishedAt ? (
        <p className="mt-2 font-mono text-xs text-slate-600">publicada por primera vez {row.publishedAt.toISOString().slice(0, 10)}</p>
      ) : null}
      <div className="mt-8">
        <ActionForm action={saveNote} hidden={id ? { id } : {}}>
          <div className="grid gap-5 md:grid-cols-2">
            <TextField name="title" label="Título" defaultValue={row?.title} required />
            <TextField name="slug" label="Slug" defaultValue={row?.slug} hint="Vacío = se genera a partir del título." />
          </div>
          <TextArea name="excerpt" label="Extracto" rows={2} defaultValue={row?.excerpt} />
          <TextField
            name="tags"
            label="Etiquetas"
            hint="Separadas por comas."
            defaultValue={row?.tags.map((t) => t.tag.name).join(", ")}
          />
          <MarkdownField name="body" label="Contenido" defaultValue={row?.body} rows={20} />
          <Checkbox name="published" label="Publicada" defaultChecked={row?.published} />
        </ActionForm>
      </div>
      {id ? (
        <div className="mt-10 border-t border-border-dark/15 pt-6">
          <DeleteButton action={deleteNoteAction} hidden={{ id }} />
        </div>
      ) : null}
    </div>
  );
}

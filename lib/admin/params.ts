import { notFound } from "next/navigation";
import { z } from "zod";

/** "new" o un UUID; cualquier otra cosa es un 404 antes de ejecutar ninguna consulta. */
export async function editorId(params: Promise<{ id: string }>): Promise<string | null> {
  const { id } = await params;
  if (id === "new") return null;
  if (!z.uuid().safeParse(id).success) notFound();
  return id;
}

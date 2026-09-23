import { apiError, apiRoute } from "@/lib/api/http";
import { getNote } from "@/lib/content";
import { slugSchema } from "@/lib/validation/content";

export const GET = apiRoute(async (_req, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) return apiError(400, "bad_request", "Invalid slug");
  const note = await getNote(slug);
  return note ?? apiError(404, "not_found", "Note not found");
});

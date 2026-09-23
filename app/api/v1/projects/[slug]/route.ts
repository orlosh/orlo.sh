import { apiError, apiRoute } from "@/lib/api/http";
import { getProject } from "@/lib/content";
import { slugSchema } from "@/lib/validation/content";

export const GET = apiRoute(async (_req, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) return apiError(400, "bad_request", "Invalid slug");
  const project = await getProject(slug);
  return project ?? apiError(404, "not_found", "Project not found");
});

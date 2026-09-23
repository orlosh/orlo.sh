import { apiError, apiRoute } from "@/lib/api/http";
import { getLanguages, getProfile } from "@/lib/content";

export const GET = apiRoute(async () => {
  const [profile, languages] = await Promise.all([getProfile(), getLanguages()]);
  if (!profile) return apiError(404, "not_found", "Profile not configured");
  return { ...profile, languages };
});

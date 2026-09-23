import { apiRoute } from "@/lib/api/http";
import { getExperience } from "@/lib/content";

export const GET = apiRoute(() => getExperience());

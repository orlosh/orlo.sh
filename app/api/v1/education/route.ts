import { apiRoute } from "@/lib/api/http";
import { getEducation } from "@/lib/content";

export const GET = apiRoute(() => getEducation());

import { apiRoute } from "@/lib/api/http";
import { getProjects } from "@/lib/content";

export const GET = apiRoute(() => getProjects());

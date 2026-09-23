import { apiRoute } from "@/lib/api/http";
import { getNotes } from "@/lib/content";

export const GET = apiRoute(() => getNotes());

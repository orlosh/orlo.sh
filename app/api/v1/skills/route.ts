import { apiRoute } from "@/lib/api/http";
import { getStack } from "@/lib/content";

export const GET = apiRoute(() => getStack());

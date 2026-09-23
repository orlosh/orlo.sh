import * as relations from "./relations";
import * as tables from "./schema";

/** Esquema completo (tablas + relaciones) para la API de consultas relacionales de drizzle. */
export const schema = { ...tables, ...relations };
export * from "./schema";

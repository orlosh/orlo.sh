import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import { schema } from "./index";

/**
 * Un pool por proceso (por instancia de función en Vercel).
 * En desarrollo, el HMR de Next vuelve a evaluar los módulos, así que el
 * cliente se guarda en globalThis para no abrir conexiones nuevas en cada cambio.
 */
const globalForDb = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };

function createClient() {
  const { DATABASE_URL, DATABASE_POOL_MAX, DATABASE_PREPARE } = env();
  return postgres(DATABASE_URL, {
    // Pocas conexiones por instancia: en serverless puede haber muchas instancias
    // a la vez y el pooler de Neon es quien multiplexa hacia PostgreSQL.
    max: DATABASE_POOL_MAX,
    // Cerrar pronto las conexiones ociosas para no retener huecos del pooler.
    idle_timeout: 10,
    // Margen para el arranque en frío de Neon cuando la base de datos estaba suspendida.
    connect_timeout: 10,
    // Con o sin sentencias preparadas, Drizzle y postgres.js envían siempre los
    // parámetros separados del texto SQL: no hay concatenación de entrada de usuario.
    prepare: DATABASE_PREPARE,
  });
}

export const sqlClient = globalForDb.__pg ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.__pg = sqlClient;

export const db = drizzle(sqlClient, { schema });
export type Db = typeof db;

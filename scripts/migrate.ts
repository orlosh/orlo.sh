/**
 * Aplica las migraciones SQL pendientes con el rol propietario del esquema.
 * Se usa en local (pnpm db:migrate) y en el job puntual `migrate` en producción,
 * para que el contenedor de runtime nunca tenga privilegios DDL.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { describeTarget } from "../lib/db-target";

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL is required");
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });

try {
  const started = Date.now();
  // Se imprime el destino antes de migrar: evita aplicar migraciones en la base
  // equivocada por haber olvidado la variable de entorno.
  console.log(`Migrando ${describeTarget(url)}`);
  await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
  console.log(JSON.stringify({ level: "info", msg: "migrations applied", ms: Date.now() - started }));
} catch (err) {
  console.error(JSON.stringify({ level: "error", msg: "migration failed", err: String(err) }));
  process.exitCode = 1;
} finally {
  await client.end();
}

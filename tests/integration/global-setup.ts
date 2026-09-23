import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Aplica las migraciones a la base de datos de test con el rol propietario, como en producción. */
export default async function setup() {
  const url = process.env.TEST_MIGRATION_DATABASE_URL;
  if (!url) throw new Error("TEST_MIGRATION_DATABASE_URL is required for integration tests");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
  await client.end();
}

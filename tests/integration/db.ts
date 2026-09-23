import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "@/db";
import type { ContentDb } from "@/lib/content/repository";

/**
 * Dos conexiones, como en producción:
 *   app   → portfolio_app (solo DML): la que usa el código bajo test.
 *   owner → portfolio_owner: solo para restablecer el estado entre tests.
 */
export function connect() {
  const appClient = postgres(process.env.TEST_DATABASE_URL!, { max: 2, onnotice: () => {} });
  const ownerClient = postgres(process.env.TEST_MIGRATION_DATABASE_URL!, { max: 1, onnotice: () => {} });
  const app = drizzle(appClient, { schema }) as ContentDb;
  const owner = drizzle(ownerClient);

  async function reset() {
    await owner.execute(sql`
      truncate table audit_log, note_tags, notes, tags, project_images, project_technologies, projects,
        experience_highlights, experience_technologies, experiences, technologies, technology_categories,
        education, languages, social_links, profile, session, account, verification, rate_limit, "user"
      restart identity cascade
    `);
    await owner.execute(sql`insert into "user" (id, name, email, role) values ('admin-1', 'Admin', 'admin@test.local', 'admin')`);
  }

  async function close() {
    await appClient.end();
    await ownerClient.end();
  }

  return { app, owner, reset, close, appClient };
}

export const ACTOR = { id: "admin-1", ip: "203.0.113.7" };

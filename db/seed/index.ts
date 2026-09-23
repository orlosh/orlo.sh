/**
 * Rellena una base de datos vacía a partir de un fichero de contenido (esquema:
 * db/seed/content.ts).
 *
 *   pnpm db:seed           inserta solo si la base de datos aún no tiene perfil
 *   pnpm db:seed --reset   vacía antes las tablas de contenido (se rechaza en producción)
 *
 * Resolución del fichero: $SEED_FILE → db/seed/content.local.json (privado, ignorado por git)
 * → db/seed/content.example.json (marcador de posición versionado).
 * Se ejecuta con el rol de runtime: solo necesita DML.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describeTarget } from "../../lib/db-target";
import * as s from "../schema";
import { existsSync, readFileSync } from "node:fs";
import { SYSTEM_DIAGRAM } from "../../lib/architecture";
import { type SeedContent, seedContentSchema } from "./content";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const reset = process.argv.includes("--reset");
if (reset && process.env.NODE_ENV === "production") {
  throw new Error("Refusing to --reset in production");
}

function loadContent(): { file: string; content: SeedContent } {
  const candidates = [process.env.SEED_FILE, "db/seed/content.local.json", "db/seed/content.example.json"];
  const file = candidates.find((f): f is string => !!f && existsSync(f));
  if (!file) throw new Error("No seed content file found");
  return { file, content: seedContentSchema.parse(JSON.parse(readFileSync(file, "utf8"))) };
}

const client = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(client);

async function main() {
  const existing = await db.select({ id: s.profile.id }).from(s.profile);
  if (existing.length > 0 && !reset) {
    console.log("Database already seeded; nothing to do (use --reset in development).");
    return;
  }

  const { file, content } = loadContent();
  console.log(`Seeding from ${file} → ${describeTarget(url!)}`);

  await db.transaction(async (tx) => {
    if (reset) {
      // Primero los hijos; las cascadas de las FK cubren las tablas de unión.
      for (const table of [
        s.noteTags,
        s.notes,
        s.tags,
        s.projectImages,
        s.projects,
        s.experiences,
        s.technologies,
        s.technologyCategories,
        s.education,
        s.languages,
        s.socialLinks,
        s.profile,
      ]) {
        await tx.delete(table);
      }
    }

    await tx.insert(s.profile).values({ id: 1, ...content.profile });

    if (content.links.length) {
      await tx.insert(s.socialLinks).values(content.links.map((l, i) => ({ ...l, position: i })));
    }

    const techIdBySlug = new Map<string, string>();
    for (const [ci, category] of content.stack.entries()) {
      const [cat] = await tx
        .insert(s.technologyCategories)
        .values({ name: category.name, slug: category.slug, position: ci })
        .returning({ id: s.technologyCategories.id });
      const rows = await tx
        .insert(s.technologies)
        .values(
          category.items.map(([name, slug], i) => ({ name, slug, categoryId: cat.id, position: i })),
        )
        .returning({ id: s.technologies.id, slug: s.technologies.slug });
      for (const r of rows) techIdBySlug.set(r.slug, r.id);
    }

    const techIds = (slugs: string[]) =>
      slugs.map((slug) => {
        const id = techIdBySlug.get(slug);
        if (!id) throw new Error(`Unknown technology slug in seed: ${slug}`);
        return id;
      });

    for (const exp of content.experience) {
      const [row] = await tx
        .insert(s.experiences)
        .values({
          company: exp.company,
          publicCompany: exp.publicCompany,
          role: exp.role,
          client: exp.client,
          startDate: exp.startDate,
          endDate: exp.endDate,
        })
        .returning({ id: s.experiences.id });
      if (exp.highlights.length) {
        await tx
          .insert(s.experienceHighlights)
          .values(exp.highlights.map((body, i) => ({ experienceId: row.id, body, position: i })));
      }
      if (exp.technologies.length) {
        await tx
          .insert(s.experienceTechnologies)
          .values(techIds(exp.technologies).map((technologyId) => ({ experienceId: row.id, technologyId })));
      }
    }

    if (content.education.length) {
      await tx.insert(s.education).values(content.education.map((e, i) => ({ ...e, position: i })));
    }
    if (content.languages.length) {
      await tx.insert(s.languages).values(content.languages.map((name, i) => ({ name, position: i })));
    }

    for (const [i, { technologies, diagram, ...project }] of content.projects.entries()) {
      const [row] = await tx
        .insert(s.projects)
        .values({ ...project, diagram: diagram === "@system" ? SYSTEM_DIAGRAM : diagram, position: i })
        .returning({ id: s.projects.id });
      if (technologies.length) {
        await tx
          .insert(s.projectTechnologies)
          .values(techIds(technologies).map((technologyId) => ({ projectId: row.id, technologyId })));
      }
    }
  });

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.end());

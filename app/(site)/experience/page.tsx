import type { Metadata } from "next";
import { Markdown } from "@/components/content/Markdown";
import { PageHeader } from "@/components/content/PageHeader";
import { TechList } from "@/components/content/TechList";
import { Timeline } from "@/components/content/Timeline";
import { Container } from "@/components/site/Container";
import { getEducation, getExperience, getLanguages } from "@/lib/content";
import { formatDuration, formatPeriod, formatYears, monthsBetween } from "@/lib/format";

export const metadata: Metadata = {
  title: "Experiencia",
  description: "Trayectoria profesional, formación, certificaciones e idiomas.",
  alternates: { canonical: "/experience" },
};

const EDUCATION_KIND = { formal: "formación reglada", certification: "certificación", course: "curso" } as const;

export default async function ExperiencePage() {
  const [experience, education, languages] = await Promise.all([getExperience(), getEducation(), getLanguages()]);

  return (
    <>
      <PageHeader label="experience" title="Trayectoria">
        <div className="mt-10">
          <Timeline items={experience} />
        </div>
      </PageHeader>

      <Container className="py-14">
        <ol className="space-y-4">
          {experience.map((e) => (
            <li key={e.id} className="grid gap-4 rounded-md border border-border-dark/15 bg-white p-6 md:grid-cols-[14rem_1fr] md:gap-10">
              <div>
                <p className="font-mono text-xs text-slate-600">{formatPeriod(e.startDate, e.endDate)}</p>
                <p className="font-mono text-xs text-slate-600">{formatDuration(monthsBetween(e.startDate, e.endDate))}</p>
                {!e.endDate ? (
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 font-mono text-xs text-carbon">
                    actual
                  </span>
                ) : null}
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-carbon">
                  {e.role}
                  {e.company ? <span className="font-normal text-slate-600"> · {e.company}</span> : null}
                </h2>
                {e.location ? <p className="mt-1 text-sm text-slate-600">{e.location}</p> : null}
                {e.description ? (
                  <div className="mt-4 max-w-3xl">
                    <Markdown variant="compact">{e.description}</Markdown>
                  </div>
                ) : null}
                {e.highlights.length ? (
                  <ul className="mt-4 max-w-3xl space-y-2 text-[0.95rem] leading-relaxed text-slate-700">
                    {e.highlights.map((h) => (
                      <li key={h} className="border-l-2 border-border-dark/20 pl-3">
                        {h}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {e.technologies.length ? (
                  <div className="mt-5">
                    <TechList items={e.technologies} />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-20 grid gap-12 md:grid-cols-[2fr_1fr]">
          <section aria-labelledby="education">
            <h2 id="education" className="border-t border-carbon pt-4 text-2xl font-semibold tracking-[-0.03em] text-carbon">
              Formación y certificaciones
            </h2>
            <ul className="mt-4 divide-y divide-border-dark/15">
              {education.map((ed) => (
                <li key={ed.title} className="grid gap-1 py-4 sm:grid-cols-[1fr_auto]">
                  <div>
                    <p className="font-medium text-carbon">{ed.title}</p>
                    <p className="text-sm text-slate-600">
                      {ed.institution} · {EDUCATION_KIND[ed.kind]}
                    </p>
                    {ed.credentialUrl ? (
                      <a href={ed.credentialUrl} className="link text-sm" target="_blank" rel="noopener noreferrer">
                        credencial ↗
                      </a>
                    ) : null}
                  </div>
                  <p className="font-mono text-xs text-slate-600">{formatYears(ed.startYear, ed.endYear)}</p>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="languages">
            <h2 id="languages" className="border-t border-carbon pt-4 text-2xl font-semibold tracking-[-0.03em] text-carbon">
              Idiomas
            </h2>
            <ul className="mt-4 divide-y divide-border-dark/15">
              {languages.map((l) => (
                <li key={l.name} className="flex justify-between py-4">
                  <span className="font-medium text-carbon">{l.name}</span>
                  {l.level ? <span className="font-mono text-xs text-slate-600">{l.level}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </Container>
    </>
  );
}

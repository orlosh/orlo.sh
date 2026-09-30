import type { Metadata } from "next";
import { Block } from "@/components/content/Block";
import { Markdown } from "@/components/content/Markdown";
import { PageHeader } from "@/components/content/PageHeader";
import { TechList } from "@/components/content/TechList";
import { Container } from "@/components/site/Container";
import { getEducation, getExperience, getLanguages } from "@/lib/content";
import { formatDuration, formatPeriod, formatYears, monthsBetween } from "@/lib/format";

export const metadata: Metadata = {
  title: "Experiencia",
  description: "Trayectoria profesional, formación, certificaciones e idiomas.",
  alternates: { canonical: "/experience" },
};

const EDUCATION_KIND = { formal: "Formación reglada", certification: "Certificación", course: "Curso" } as const;

export default async function ExperiencePage() {
  const [experience, education, languages] = await Promise.all([getExperience(), getEducation(), getLanguages()]);

  return (
    <>
      <PageHeader title="Experiencia" />

      <Container>
        <ol className="space-y-4">
          {experience.map((e) => (
            <li key={e.id} className="border border-primary/15 bg-carbon p-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <h2 className="text-xl font-bold text-white">
                  {e.role}
                  {e.company ? <span className="font-normal text-slate-400"> · {e.company}</span> : null}
                </h2>
                <p className="shrink-0 text-sm text-slate-400">
                  {formatPeriod(e.startDate, e.endDate)} · {formatDuration(monthsBetween(e.startDate, e.endDate))}
                </p>
              </div>
              {e.location ? <p className="mt-1 text-sm text-slate-400">{e.location}</p> : null}
              {e.description ? (
                <div className="mt-4 max-w-[68ch]">
                  <Markdown variant="compact">{e.description}</Markdown>
                </div>
              ) : null}
              {e.highlights.length ? (
                <ul className="mt-4 max-w-[68ch] list-disc space-y-1.5 pl-5 leading-relaxed text-slate-300 marker:text-primary">
                  {e.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              ) : null}
              <TechList items={e.technologies} className="mt-5" />
            </li>
          ))}
        </ol>
      </Container>

      <Block id="education" title="Formación">
        <ul className="divide-y divide-white/10 border-y border-white/10">
          {education.map((ed) => (
            <li key={ed.title} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <div>
                <p className="font-semibold text-white">{ed.title}</p>
                <p className="text-sm text-slate-400">
                  {ed.institution} · {EDUCATION_KIND[ed.kind]}
                  {ed.credentialUrl ? (
                    <>
                      {" · "}
                      <a href={ed.credentialUrl} className="link" target="_blank" rel="noopener noreferrer">
                        Credencial ↗
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <p className="shrink-0 text-sm text-slate-400">{formatYears(ed.startYear, ed.endYear)}</p>
            </li>
          ))}
        </ul>
      </Block>

      {languages.length ? (
        <Block id="languages" title="Idiomas">
          <ul className="divide-y divide-white/10 border-y border-white/10">
            {languages.map((l) => (
              <li key={l.name} className="flex justify-between gap-6 py-4">
                <span className="font-semibold text-white">{l.name}</span>
                {l.level ? <span className="text-slate-400">{l.level}</span> : null}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </>
  );
}

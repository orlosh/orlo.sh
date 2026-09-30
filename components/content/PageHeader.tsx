import { Container } from "@/components/site/Container";

/** Cabecera de las páginas interiores. */
export function PageHeader({
  label,
  title,
  intro,
  children,
}: {
  label?: React.ReactNode;
  title: string;
  intro?: string;
  children?: React.ReactNode;
}) {
  return (
    <header>
      <Container className="pb-10 pt-14 md:pt-20">
        {label ? <div className="mb-4 text-sm text-slate-400">{label}</div> : null}
        <h1 className="text-[clamp(2.25rem,5vw,3.25rem)] font-bold leading-tight text-white [overflow-wrap:anywhere]">
          {title}
        </h1>
        {intro ? <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-300">{intro}</p> : null}
        {children}
      </Container>
    </header>
  );
}

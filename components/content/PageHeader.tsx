import { Container } from "@/components/site/Container";

/** Banda de apertura para páginas interiores: cuadrícula de puntos, etiqueta, título grande, intro opcional. */
export function PageHeader({
  label,
  title,
  intro,
  children,
}: {
  label: string;
  title: string;
  intro?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative border-b border-border-dark/15">
      <div aria-hidden className="dot-grid dot-grid-fade absolute inset-0" />
      <Container className="relative pb-14 pt-16 md:pt-24">
        <p className="label">{label}</p>
        <h1 className="mt-4 max-w-4xl text-[clamp(2.75rem,7vw,5.5rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-carbon">
          {title}
        </h1>
        {intro ? <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-700">{intro}</p> : null}
        {children}
      </Container>
    </div>
  );
}

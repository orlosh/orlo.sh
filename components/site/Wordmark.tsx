/** "orlo.sh": el borde vivo (un bloque verde) aplicado al propio nombre. */
export function Wordmark({ brand, className = "", mark = true }: { brand: string; className?: string; mark?: boolean }) {
  const dot = brand.lastIndexOf(".");
  const [name, tld] = dot > 0 ? [brand.slice(0, dot), brand.slice(dot)] : [brand, ""];
  return (
    <span className={`inline-flex items-baseline font-semibold tracking-[-0.04em] ${className}`}>
      {mark ? <span aria-hidden className="mr-[0.28em] inline-block size-[0.42em] translate-y-[-0.05em] rounded-[2px] bg-primary" /> : null}
      <span>{name}</span>
      {tld ? <span className="text-slate-600">{tld}</span> : null}
    </span>
  );
}

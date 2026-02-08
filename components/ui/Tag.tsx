export function Tag({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <span className="px-3 py-1 bg-carbon border border-border-dark rounded font-mono text-xs text-slate-400">
      {children}
    </span>
  );
}

import { Tag } from "@/components/ui/Tag";

export function Hero() {
  const skillTags = [
    "#AWS",
    "#Kubernetes",
    "#Terraform",
    "#React",
    "#Python",
    "#Docker",
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center mb-24">
      <div className="lg:col-span-7 flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          {/* BADGE */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 w-fit">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-xs font-mono text-primary uppercase tracking-widest">
              System Online: v2.1.0
            </span>
          </div>
          <h1 className="text-white text-5xl md:text-7xl font-bold leading-[1.1] tracking-tight">
            Automatizando{" "}
            <span className="text-primary italic">Full Stack</span>
          </h1>
          <p className="text-slate-400 text-lg md:text-xl max-w-xl font-light leading-relaxed">
            Uniendo el mundo del código y la infraestructura con Kubernetes, AWS
            y React. Especialista en sistemas de alta disponibilidad y
            desarrollo web moderno.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <button className="cursor-pointer group flex items-center gap-2 px-6 h-12 rounded-lg bg-primary text-background-dark font-bold transition-all hover:bg-primary/90">
            <span>Deploy Proyectos</span>
            <span className="material-symbols-outlined text-xl transition-transform group-hover:translate-x-1">
              arrow_forward
            </span>
          </button>
          <button className="cursor-pointer flex items-center gap-2 px-6 h-12 rounded-lg bg-carbon border border-border-dark text-white font-bold transition-all hover:border-primary/50">
            <span className="material-symbols-outlined text-xl">download</span>
            <span>Descargar CV</span>
          </button>
        </div>
        {/* SKILL TAGS */}
        <div className="flex flex-wrap gap-2 pt-4">
          {skillTags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      </div>
      {/* MONITOREO */}
      <div className="lg:col-span-5">
        <div className="bg-carbon border border-border-dark rounded-xl p-6 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 scanline pointer-events-none"></div>
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-slate-400 font-mono text-xs uppercase tracking-tighter">
              System Monitoring
            </h3>
            <span className="material-symbols-outlined text-slate-600">
              settings
            </span>
          </div>
          <div className="space-y-6">
            {/* <!-- Metric --> */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-500">CPU Usage</span>
                <span className="text-primary">24.5%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-primary w-[24.5%]"></div>
              </div>
            </div>
            {/* <!-- Metric --> */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-500">Memory Cluster</span>
                <span className="text-primary">62.1%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-primary w-[62.1%] shadow-[0_0_10px_rgba(13,242,89,0.5)]"></div>
              </div>
            </div>
            {/* <!-- Metric --> */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-500">Network Traffic</span>
                <span className="text-primary">Stable</span>
              </div>
              <div className="flex gap-1">
                <div className="h-8 flex-1 bg-primary/20 rounded-sm"></div>
                <div className="h-8 flex-1 bg-primary/40 rounded-sm"></div>
                <div className="h-8 flex-1 bg-primary/10 rounded-sm"></div>
                <div className="h-8 flex-1 bg-primary/60 rounded-sm"></div>
                <div className="h-8 flex-1 bg-primary/30 rounded-sm"></div>
                <div className="h-8 flex-1 bg-primary/20 rounded-sm"></div>
                <div className="h-8 flex-1 bg-primary/80 rounded-sm"></div>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-border-dark flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-500 font-mono uppercase">
                Region Availability
              </p>
              <p className="text-xs text-white font-mono mt-1">
                EU-South, US-East, AP-South
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-500 font-mono uppercase">
                Uptime
              </p>
              <p className="text-xs text-primary font-mono mt-1">99.998%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

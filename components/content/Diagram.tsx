import type { Diagram as DiagramModel, DiagramNode } from "@/lib/content/types";

/**
 * Diagrama de arquitectura renderizado como SVG inline a partir de un modelo de nodos/aristas
 * (guardado como JSON en la base de datos, validado por diagramSchema).
 * Siempre se dibuja sobre un panel oscuro de «pantalla» (ver DiagramPanel): el camino activo en
 * verde necesita un fondo oscuro para ser legible. Renderizado en servidor, cero JS de cliente.
 * `column` es la posición horizontal y `lane`, la vertical. Los nodos/aristas resaltados usan el
 * color de acento: marcan el camino que realmente sigue una petición.
 */
const NODE_W = 168;
const NODE_H = 56;
const GAP_X = 56;
const GAP_Y = 36;
const PAD = 12;

function box(n: DiagramNode) {
  const x = PAD + n.column * (NODE_W + GAP_X);
  const y = PAD + n.lane * (NODE_H + GAP_Y);
  return { x, y, cx: x + NODE_W / 2, cy: y + NODE_H / 2 };
}

function edgePath(a: DiagramNode, b: DiagramNode): string {
  const A = box(a);
  const B = box(b);
  if (a.lane === b.lane) {
    const [from, to] = A.x < B.x ? [A, B] : [B, A];
    return `M ${from.x + NODE_W} ${from.cy} H ${to.x}`;
  }
  if (a.column === b.column) {
    const [top, bottom] = A.y < B.y ? [A, B] : [B, A];
    return `M ${top.cx} ${top.y + NODE_H} V ${bottom.y}`;
  }
  // Distinta fila (lane) y columna (column): sale en horizontal, gira en el hueco entre columnas
  // (nunca atravesando un nodo) y luego entra en el destino por su lateral.
  const rightward = B.x > A.x;
  const startX = rightward ? A.x + NODE_W : A.x;
  const endX = rightward ? B.x : B.x + NODE_W;
  const channelX = rightward ? B.x - GAP_X / 2 : B.x + NODE_W + GAP_X / 2;
  return `M ${startX} ${A.cy} H ${channelX} V ${B.cy} H ${endX}`;
}

export function Diagram({
  model,
  title,
  highlight = [],
}: {
  model: DiagramModel;
  title: string;
  highlight?: string[];
}) {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const cols = Math.max(...model.nodes.map((n) => n.column)) + 1;
  const lanes = Math.max(...model.nodes.map((n) => n.lane)) + 1;
  const width = PAD * 2 + cols * NODE_W + (cols - 1) * GAP_X;
  const height = PAD * 2 + lanes * NODE_H + (lanes - 1) * GAP_Y;
  const hot = new Set(highlight);
  const titleId = `dg-${title.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    // Enfocable para que quien use el teclado pueda desplazarlo en horizontal en pantallas pequeñas.
    <figure className="overflow-x-auto" tabIndex={0} aria-label={title}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="h-auto max-w-full min-w-[36rem] font-mono"
        role="img"
        aria-labelledby={`${titleId}-t ${titleId}-d`}
      >
        <title id={`${titleId}-t`}>{title}</title>
        <desc id={`${titleId}-d`}>
          {model.edges
            .map((e) => `${byId.get(e.from)?.label} → ${byId.get(e.to)?.label}${e.label ? ` (${e.label})` : ""}`)
            .join("; ")}
        </desc>
        <defs>
          <marker id={`${titleId}-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" className="fill-slate-500" />
          </marker>
          <marker id={`${titleId}-arrow-hot`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" className="fill-primary" />
          </marker>
        </defs>

        {model.edges.map((e) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          const isHot = hot.has(e.from) && hot.has(e.to);
          const d = edgePath(a, b);
          const A = box(a);
          const B = box(b);
          return (
            <g key={`${e.from}-${e.to}`}>
              <path
                d={d}
                fill="none"
                strokeWidth={isHot ? 1.5 : 1}
                className={isHot ? "stroke-primary" : "stroke-slate-500"}
                markerEnd={`url(#${titleId}-${isHot ? "arrow-hot" : "arrow"})`}
              />
              {e.label ? (
                <text
                  x={a.lane === b.lane ? (A.cx + B.cx) / 2 : (B.x > A.x ? B.x - GAP_X / 2 : B.x + NODE_W + GAP_X / 2) + 5}
                  y={a.lane === b.lane ? A.cy - 8 : (A.cy + B.cy) / 2 + 3}
                  textAnchor={a.lane === b.lane ? "middle" : "start"}
                  className="fill-slate-400 text-[10px]"
                >
                  {e.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {model.nodes.map((n) => {
          const { x, y, cx } = box(n);
          const isHot = hot.has(n.id);
          return (
            <g key={n.id}>
              <rect
                x={x}
                y={y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                className={`fill-carbon ${isHot ? "stroke-primary" : "stroke-white/20"}`}
                strokeWidth={1}
              />
              <text
                x={cx}
                y={n.detail ? y + 23 : y + NODE_H / 2 + 4}
                textAnchor="middle"
                className="fill-white text-[12px] font-medium"
              >
                {n.label}
              </text>
              {n.detail ? (
                <text x={cx} y={y + 40} textAnchor="middle" className="fill-slate-400 text-[10px]">
                  {n.detail}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** El panel oscuro sobre el que se coloca cada diagrama, con su pie. */
export function DiagramPanel({ children, caption }: { children: React.ReactNode; caption?: React.ReactNode }) {
  return (
    <div className="on-dark overflow-hidden rounded-md bg-background-dark text-slate-300 ring-1 ring-white/10">
      <div className="dot-grid-dark p-4 sm:p-6">{children}</div>
      {caption ? <div className="border-t border-white/10 px-4 py-3 font-mono text-xs text-slate-400 sm:px-6">{caption}</div> : null}
    </div>
  );
}

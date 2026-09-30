import type { Diagram as DiagramModel, DiagramNode } from "@/lib/content/types";

/**
 * Diagrama de arquitectura renderizado como SVG inline a partir de un modelo de nodos/aristas
 * (guardado como JSON en la base de datos, validado por diagramSchema). Líneas finas sobre el
 * fondo oscuro; el camino resaltado (el que sigue una petición) va en verde con nodos de filete
 * blanco. Renderizado en servidor, cero JS de cliente.
 * `column` es la posición horizontal y `lane`, la vertical.
 */
const NODE_W = 172;
const NODE_H = 58;
const GAP_X = 60;
const GAP_Y = 38;
const PAD = 14;

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

  const edges = model.edges.flatMap((e) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    return a && b ? [{ e, a, b, d: edgePath(a, b), isHot: hot.has(e.from) && hot.has(e.to) }] : [];
  });

  return (
    // Enfocable para que quien use el teclado pueda desplazarlo en horizontal en pantallas pequeñas.
    <figure className="overflow-x-auto" tabIndex={0} aria-label={title}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="h-auto min-w-[38rem] max-w-full font-mono"
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

        {edges.map(({ e, a, b, d, isHot }) => {
          const A = box(a);
          const B = box(b);
          return (
            <g key={`${e.from}-${e.to}`}>
              <path
                d={d}
                fill="none"
                strokeWidth={isHot ? 1.5 : 1}
                className={isHot ? "stroke-primary" : "stroke-slate-600"}
                markerEnd={`url(#${titleId}-${isHot ? "arrow-hot" : "arrow"})`}
              />
              {e.label ? (
                <text
                  x={a.lane === b.lane ? (A.cx + B.cx) / 2 : (B.x > A.x ? B.x - GAP_X / 2 : B.x + NODE_W + GAP_X / 2) + 6}
                  y={a.lane === b.lane ? A.cy - 10 : (A.cy + B.cy) / 2 + 3}
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
                rx={4}
                className={isHot ? "fill-carbon stroke-primary" : "fill-background-dark stroke-white/20"}
                strokeWidth={1}
              />
              <text
                x={cx}
                y={n.detail ? y + 25 : y + NODE_H / 2 + 4}
                textAnchor="middle"
                className="fill-white text-[13px]"
              >
                {n.label}
              </text>
              {n.detail ? (
                <text x={cx} y={y + 42} textAnchor="middle" className="fill-slate-400 text-[10px]">
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

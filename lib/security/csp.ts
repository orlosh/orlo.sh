/**
 * Constructor de la Content-Security-Policy. Lo comparten proxy.ts (que la envía) y
 * la página /engineering (que muestra la política exacta con la que funciona este sitio).
 *
 * script-src: nonce por petición + 'strict-dynamic'. Sin 'unsafe-inline', así que un
 *   <script> inyectado no puede ejecutarse aunque algún día se colara algo de HTML.
 * style-src: 'unsafe-inline' es una concesión deliberada. Next.js y React fijan
 *   atributos style que los nonces no pueden cubrir; la inyección de CSS es mucho menos
 *   peligrosa que la de scripts, y todo el contenido de usuario se renderiza desde
 *   Markdown con el HTML en bruto desactivado.
 */
export function buildCsp(nonce: string, { dev = false }: { dev?: boolean } = {}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "https:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(dev ? ["ws:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    ...(dev ? {} : { "upgrade-insecure-requests": [] }),
  };
  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(" ")}` : k))
    .join("; ");
}

/** 128 bits de aleatoriedad, en base64. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Cabeceras fijas que se aplican a todas las respuestas (ver next.config.ts). */
export const SECURITY_HEADERS = [
  // Dos años de HTTPS obligatorio, también en subdominios. Sin "preload": entrar
  // en la lista de precarga de los navegadores es una decisión aparte y difícil de revertir.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
] as const;

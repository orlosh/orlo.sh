/** Origen público. Se lee sin el esquema de env completo para que sea seguro al hacer el build. */
export function siteUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Marca de respaldo mientras no exista la fila del perfil. La real vive en la base de datos. */
export const DEFAULT_BRAND = "orlo.sh";

export const NAV = [
  { href: "/projects", label: "proyectos" },
  { href: "/stack", label: "stack" },
  { href: "/experience", label: "experiencia" },
  { href: "/notes", label: "notas" },
  { href: "/engineering", label: "ingeniería" },
] as const;

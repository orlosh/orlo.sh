import Link from "next/link";
import { signOut } from "@/lib/admin/actions";
import { requireAdminPage } from "@/lib/auth/guard";

const NAV = [
  ["/admin", "Resumen"],
  ["/admin/profile", "Perfil"],
  ["/admin/experience", "Experiencia"],
  ["/admin/projects", "Proyectos"],
  ["/admin/stack", "Stack"],
  ["/admin/notes", "Notas"],
  ["/admin/education", "Formación"],
] as const;

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // Frontera de autorización para todas las páginas por debajo. Las acciones vuelven a comprobarlo
  // por su cuenta.
  const session = await requireAdminPage();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[14rem_1fr]">
      <aside className="border-b border-border-dark/15 p-4 md:min-h-dvh md:border-b-0 md:border-r md:bg-white">
        <p className="border-l-2 border-primary pl-3 text-sm font-semibold text-carbon">Admin</p>
        <nav aria-label="Administración" className="mt-6">
          <ul className="flex flex-wrap gap-x-4 gap-y-2 md:flex-col">
            {NAV.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-sm text-slate-700 hover:text-carbon">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-8 space-y-3 border-t border-border-dark/15 pt-4 text-xs text-slate-600">
          <p className="break-all font-mono">{session.user.email}</p>
          <Link href="/" className="block hover:text-carbon">
            Ver sitio público ↗
          </Link>
          <form action={signOut}>
            <button type="submit" className="hover:text-carbon">
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>
      <main id="main" className="min-w-0 p-4 md:p-10">
        {children}
      </main>
    </div>
  );
}

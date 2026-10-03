import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { Wordmark } from "@/components/site/Wordmark";
import { signOut } from "@/lib/admin/actions";
import { requireAdminPage } from "@/lib/auth/guard";
import { DEFAULT_BRAND } from "@/lib/site";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // Frontera de autorización para todas las páginas por debajo. Las acciones vuelven a comprobarlo
  // por su cuenta.
  const session = await requireAdminPage();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="flex flex-col border-b border-slate-200 bg-white p-4 md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
        <Link href="/admin" className="flex items-baseline gap-2 px-3 py-1">
          <span className="font-mono text-lg font-bold text-carbon">
            <Wordmark brand={DEFAULT_BRAND} />
          </span>
          <span className="font-mono text-xs text-slate-500">admin</span>
        </Link>
        <nav aria-label="Administración" className="mt-6">
          <AdminNav />
        </nav>
        <div className="mt-6 space-y-1 border-t border-slate-200 pt-4 text-sm md:mt-auto">
          <p className="truncate px-3 pb-2 font-mono text-xs text-slate-500" title={session.user.email}>
            {session.user.email}
          </p>
          <Link href="/" className="block rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-50 hover:text-carbon">
            Ver sitio público ↗
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full rounded-md px-3 py-1.5 text-left text-slate-600 hover:bg-slate-50 hover:text-carbon"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>
      <main id="main" className="min-w-0 px-4 py-8 md:px-12 md:py-12">
        {children}
      </main>
    </div>
  );
}

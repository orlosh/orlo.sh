import type { Viewport } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/site/Container";
import { Wordmark } from "@/components/site/Wordmark";
import { getSession, isAdmin } from "@/lib/auth/guard";
import { getProfile } from "@/lib/content";
import { DEFAULT_BRAND } from "@/lib/site";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Acceso" };

// El login es una pantalla pública más: terminal oscura, como el resto del sitio.
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (isAdmin(session)) redirect("/admin");
  const [{ error }, profile] = await Promise.all([searchParams, getProfile()]);
  const brand = profile?.displayName ?? DEFAULT_BRAND;
  return (
    <div className="site flex min-h-dvh flex-col">
      <header className="border-b border-primary/15">
        <Container className="flex items-center justify-between gap-6 py-5">
          <Link
            href="/"
            className="text-xl font-bold text-white"
            aria-label={`${brand}, inicio`}
          >
            <Wordmark brand={brand} />
          </Link>
          <Link href="/" className="text-slate-400 hover:text-white">
            ← volver al sitio
          </Link>
        </Container>
      </header>

      <main
        id="main"
        className="flex flex-1 items-center justify-center px-4 py-16"
      >
        <div className="w-full max-w-md">
          <div className="border border-primary/20 bg-carbon shadow-[0_0_40px_rgb(13_242_89/0.06)]">
            <div className="flex items-center justify-between border-b border-primary/15 px-4 py-2 text-sm text-slate-400">
              <span>tty1</span>
              <span>/admin/login</span>
            </div>
            <div className="p-6 md:p-8">
              <p className="text-slate-400">
                <span className="glow text-primary">$</span> sudo -u admin login
              </p>
              <h1 className="cursor mt-3 text-3xl font-bold text-white">
                Acceso
              </h1>
              {error === "forbidden" || (session && !isAdmin(session)) ? (
                <p role="alert" className="mt-5 text-sm text-red-500">
                  Esta cuenta no tiene permisos de administración.
                </p>
              ) : null}
              <LoginForm />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

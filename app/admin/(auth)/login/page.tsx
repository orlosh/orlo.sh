import { redirect } from "next/navigation";
import { getSession, isAdmin } from "@/lib/auth/guard";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Acceso" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getSession();
  if (isAdmin(session)) redirect("/admin");
  const { error } = await searchParams;
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <p className="label">Admin</p>
      <h1 className="mt-2 text-2xl font-semibold text-carbon">Acceso al panel</h1>
      {error === "forbidden" || (session && !isAdmin(session)) ? (
        <p role="alert" className="mt-4 text-sm text-red-500">
          Esta cuenta no tiene permisos de administración.
        </p>
      ) : null}
      <LoginForm />
    </main>
  );
}

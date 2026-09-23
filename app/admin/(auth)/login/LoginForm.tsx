"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const { error } = await authClient.signIn.email({
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
    });
    setPending(false);
    if (error) {
      // Mismo mensaje para usuario desconocido y contraseña incorrecta: sin enumeración de cuentas.
      setError(error.status === 429 ? "Demasiados intentos. Espera unos minutos." : "Credenciales no válidas.");
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  const input =
    "w-full rounded-sm border border-border-dark/15 bg-white px-3 py-2 text-sm text-carbon focus:border-carbon";
  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="label block">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className={input} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="label block">
          Contraseña
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={input} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-background-dark disabled:opacity-60"
      >
        {pending ? "Comprobando…" : "Entrar"}
      </button>
      <p role="alert" aria-live="assertive" className="min-h-5 text-sm text-red-500">
        {error}
      </p>
    </form>
  );
}

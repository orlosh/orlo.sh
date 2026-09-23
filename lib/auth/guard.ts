import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth, type Session } from "./index";

/** Una sola consulta de sesión por petición, compartida por layout, página y actions. */
export const getSession = cache(async (): Promise<Session | null> => {
  return auth.api.getSession({ headers: await headers() });
});

export function isAdmin(session: Session | null): session is Session {
  return session?.user.role === "admin";
}

/** Para páginas de admin: anónimo → login, autenticado sin rol admin → página 403. */
export async function requireAdminPage(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (!isAdmin(session)) redirect("/admin/login?error=forbidden");
  return session;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
  }
}

/**
 * Para Server Actions. Las actions son endpoints HTTP públicos independientemente de qué
 * página las renderice, así que cada mutación vuelve a comprobar la autorización por sí misma.
 */
export async function requireAdminAction(): Promise<Session> {
  const session = await getSession();
  if (!isAdmin(session)) throw new UnauthorizedError();
  return session;
}

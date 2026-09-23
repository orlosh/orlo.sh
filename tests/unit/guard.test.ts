import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reglas de autorización, con el framework y la librería de auth sustituidos por mocks:
 * el guard debe denegar a los usuarios anónimos Y a los autenticados que no son admin.
 */
const getSession = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } } }));

const guard = await import("@/lib/auth/guard");

const session = (role: string) => ({ user: { id: "u1", email: "u@x", role }, session: { id: "s1" } });

describe("admin guard", () => {
  beforeEach(() => getSession.mockReset());

  it("rejects anonymous callers of a Server Action", async () => {
    getSession.mockResolvedValue(null);
    await expect(guard.requireAdminAction()).rejects.toBeInstanceOf(guard.UnauthorizedError);
  });

  it("rejects authenticated users without the admin role", async () => {
    getSession.mockResolvedValue(session("viewer"));
    await expect(guard.requireAdminAction()).rejects.toBeInstanceOf(guard.UnauthorizedError);
  });

  it("allows admins", async () => {
    getSession.mockResolvedValue(session("admin"));
    await expect(guard.requireAdminAction()).resolves.toMatchObject({ user: { role: "admin" } });
  });

  it("redirects pages: anonymous → login, non-admin → forbidden", async () => {
    getSession.mockResolvedValue(null);
    await expect(guard.requireAdminPage()).rejects.toThrow("REDIRECT /admin/login");
    getSession.mockResolvedValue(session("viewer"));
    await expect(guard.requireAdminPage()).rejects.toThrow("REDIRECT /admin/login?error=forbidden");
  });
});

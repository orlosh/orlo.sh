import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "@/lib/security/csp";
import { clientIp } from "@/lib/security/client-ip";
import { createRateLimiter } from "@/lib/security/rate-limit";

describe("CSP", () => {
  it("allows scripts only by nonce in production", () => {
    const csp = buildCsp("abc");
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("only relaxes eval in development", () => {
    expect(buildCsp("n", { dev: true })).toContain("'unsafe-eval'");
  });

  it("generates unpredictable 128-bit nonces", () => {
    const nonces = new Set(Array.from({ length: 100 }, createNonce));
    expect(nonces.size).toBe(100);
    expect(Buffer.from([...nonces][0], "base64")).toHaveLength(16);
  });
});

describe("rate limiter", () => {
  it("blocks after the limit and resets after the window", () => {
    const check = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(check("ip", 0).allowed).toBe(true);
    expect(check("ip", 10).allowed).toBe(true);
    const blocked = check("ip", 20);
    expect(blocked).toMatchObject({ allowed: false, remaining: 0, resetAt: 1000 });
    expect(check("other", 20).allowed).toBe(true);
    expect(check("ip", 1000).allowed).toBe(true);
  });

  it("keeps memory bounded", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
    for (const k of ["a", "b", "c", "d"]) check(k, 0);
    // "a" fue desalojada, así que empieza una ventana nueva.
    expect(check("a", 1).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  const h = new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.2" });

  it("ignores forwarding headers unless one is explicitly trusted", () => {
    expect(clientIp(h, null)).toBeNull();
    expect(clientIp(h, "x-forwarded-for")).toBe("198.51.100.1");
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.9" }), "x-real-ip")).toBe("203.0.113.9");
    // Si la cabecera de confianza no viene, no hay IP (nunca se recurre a otra falsificable).
    expect(clientIp(h, "x-real-ip")).toBeNull();
  });
});

import AxeBuilder from "@axe-core/playwright";
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const PRIVATE_SEED = "db/seed/content.local.json";

const PAGES = ["/", "/projects", "/projects/portfolio", "/stack", "/experience", "/notes", "/engineering"];

test.describe("public site", () => {
  for (const path of PAGES) {
    test(`${path} renders without accessibility violations`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      // Sin scroll horizontal de la página en ningún viewport.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
      // También detecta las violaciones de CSP, que se notifican como errores de consola.
      expect(errors).toEqual([]);
    });
  }

  test("content comes from the database, not the markup", async ({ page, request }) => {
    const api = await (await request.get("/api/v1/experience")).json();
    await page.goto("/experience");
    for (const e of api.data) {
      await expect(page.getByRole("heading", { level: 2, name: new RegExp(e.role) }).first()).toBeVisible();
    }
  });

  test("private data never reaches public pages or the API", async ({ request }) => {
    // Los nombres privados salen del fichero de seed ignorado por git; se omite si no existe
    // (p. ej., en CI).
    test.skip(!existsSync(PRIVATE_SEED), "no private seed file");
    const seed = JSON.parse(readFileSync(PRIVATE_SEED, "utf8"));
    const secrets: string[] = seed.experience
      .flatMap((e: { company: string; client: string | null; publicCompany: string | null }) =>
        e.publicCompany ? [] : [e.company, e.client],
      )
      .filter(Boolean);
    expect(secrets.length).toBeGreaterThan(0);
    for (const path of ["/", "/experience", "/api/v1/experience", "/api/v1/profile", "/sitemap.xml"]) {
      const body = await (await request.get(path)).text();
      for (const secret of secrets) expect(body, `${secret} leaked on ${path}`).not.toContain(secret);
    }
  });

  test("unknown project slug is a 404", async ({ page }) => {
    expect((await page.goto("/projects/does-not-exist"))?.status()).toBe(404);
  });

  test("skip link moves focus to the main content", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium");
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });
});

test.describe("security headers", () => {
  test("pages carry a nonce-based CSP and hardening headers", async ({ request }) => {
    const a = await request.get("/");
    const b = await request.get("/");
    const csp = a.headers()["content-security-policy"];
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(b.headers()["content-security-policy"]).not.toBe(csp); // nonce nuevo en cada respuesta
    expect(a.headers()["x-content-type-options"]).toBe("nosniff");
    expect(a.headers()["x-frame-options"]).toBe("DENY");
    expect(a.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(a.headers()["strict-transport-security"]).toContain("max-age=63072000");
    expect(a.headers()["x-powered-by"]).toBeUndefined();
  });

  test("admin is not indexable", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /admin");
  });
});

test.describe("api and health", () => {
  test("/health reports the database", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toBe("no-store");
    expect(await res.json()).toMatchObject({ status: "ok", checks: { database: { status: "up" } } });
  });

  test("api uses a consistent envelope and validates input", async ({ request }) => {
    const ok = await request.get("/api/v1/projects");
    expect((await ok.json()).data).toEqual(expect.any(Array));
    expect(ok.headers()["x-ratelimit-limit"]).toBe("60");

    const bad = await request.get("/api/v1/projects/NOT_A_SLUG");
    expect(bad.status()).toBe(400);
    expect(await bad.json()).toEqual({ error: { code: "bad_request", message: expect.any(String) } });

    const missing = await request.get("/api/v1/notes/does-not-exist");
    expect(missing.status()).toBe(404);

    expect((await request.post("/api/v1/projects")).status()).toBe(405);
  });
});

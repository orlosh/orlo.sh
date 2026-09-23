import { expect, test } from "@playwright/test";

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@example.test";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "local-dev-password-123";

test.describe("admin access control", () => {
  test("anonymous visitors are sent to the login page", async ({ page }) => {
    for (const path of ["/admin", "/admin/projects", "/admin/notes/new"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login$/);
    }
  });

  test("public sign-up is disabled", async ({ request, baseURL }) => {
    const res = await request.post("/api/auth/sign-up/email", {
      headers: { origin: baseURL! },
      data: { email: "intruder@example.com", password: "long-enough-password", name: "x" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("auth rejects cross-origin requests", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      headers: { origin: "https://evil.example" },
      data: { email: EMAIL, password: PASSWORD },
    });
    expect(res.status()).toBe(403);
  });

  test("wrong credentials show a generic error", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Contraseña").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("Credenciales no válidas.");
  });
});

test("admin publishes a note and it appears on the public site", async ({ page }) => {
  const slug = `e2e-${Date.now()}`;
  const title = `Nota E2E ${slug}`;

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name.includes("session_token"));
  expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });

  await page.goto("/admin/notes/new");
  await page.getByLabel("Título").fill(title);
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Extracto").fill("Creada por el test E2E.");
  await page.getByLabel("Etiquetas").fill("testing, e2e");
  await page.getByLabel("Contenido").fill("## Hola\n\n<script>alert(1)</script>\n\nTexto **en negrita**.");
  await page.getByLabel("Publicada").check();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/admin\/notes$/);

  // Visible al instante: la Server Action invalidó la etiqueta de caché.
  await page.goto("/notes");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.locator("article strong")).toHaveText("en negrita");
  // El HTML en bruto dentro del Markdown se descarta; nunca se ejecuta ni se renderiza.
  expect(await page.locator("article script").count()).toBe(0);

  // El cambio queda en el registro de auditoría.
  await page.goto("/admin");
  await expect(page.locator("tbody tr").first()).toContainText("note");

  // Eliminarla y comprobar que ha desaparecido del sitio público.
  await page.goto("/admin/notes");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Eliminar" }).click();
  await expect(page).toHaveURL(/\/admin\/notes$/);
  expect((await page.goto(`/notes/${slug}`))?.status()).toBe(404);

  // Cerrar sesión termina la sesión en el servidor.
  await page.goto("/admin");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

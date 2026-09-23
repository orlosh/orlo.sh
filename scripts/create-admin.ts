/**
 * Crea la cuenta de administrador (o restablece su contraseña).
 *
 *   ADMIN_EMAIL=me@example.com pnpm admin:create
 *
 * La contraseña se pide por consola sin mostrarla. Si ADMIN_PASSWORD viene del entorno
 * (o del .env), se usa esa y se avisa: útil para CI, arriesgado en producción, porque
 * queda escrita en un fichero.
 * El registro público está desactivado, así que esta es la única forma de obtener una cuenta.
 */
import { randomUUID } from "node:crypto";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { account, user } from "../db/schema";
import { describeTarget } from "../lib/db-target";

async function promptHidden(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
    if (s.startsWith(question)) write.call(rl, question);
  };
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  stdout.write("\n");
  return answer;
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim() || "Admin";
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error("Set ADMIN_EMAIL to a valid address");
  // Una variable vacía cuenta como "no definida": así se puede forzar la pregunta
  // con ADMIN_PASSWORD= aunque el .env traiga un valor.
  const fromEnv = process.env.ADMIN_PASSWORD?.trim();
  if (fromEnv) {
    console.log("Contraseña tomada de ADMIN_PASSWORD (no se pregunta por consola).");
  } else if (!stdin.isTTY) {
    throw new Error("No hay terminal interactiva: define ADMIN_PASSWORD para ejecutarlo sin preguntas");
  }
  const password = fromEnv || (await promptHidden("Contraseña (mínimo 12 caracteres): "));
  if (password.length < 12) throw new Error("Password must be at least 12 characters");

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  console.log(`Base de datos: ${describeTarget(url)}`);
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  try {
    const hash = await hashPassword(password);
    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(user).where(eq(user.email, email));
      const userId = existing?.id ?? randomUUID();
      if (existing) {
        await tx.update(user).set({ role: "admin", updatedAt: new Date() }).where(eq(user.id, userId));
      } else {
        await tx.insert(user).values({ id: userId, email, name, role: "admin", emailVerified: true });
      }
      const [cred] = await tx
        .select()
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
      if (cred) {
        await tx.update(account).set({ password: hash, updatedAt: new Date() }).where(eq(account.id, cred.id));
      } else {
        await tx
          .insert(account)
          .values({ id: randomUUID(), userId, accountId: userId, providerId: "credential", password: hash });
      }
      console.log(existing ? `Updated admin ${email}` : `Created admin ${email}`);
    });
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

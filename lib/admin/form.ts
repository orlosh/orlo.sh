/** Helpers para convertir FormData en objetos planos que los esquemas de Zod puedan validar. */

export type ActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

export const idle: ActionState = { status: "idle" };

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export function bool(fd: FormData, key: string): boolean {
  return fd.get(key) === "on" || fd.get(key) === "true";
}

export function list(fd: FormData, key: string): string[] {
  return fd.getAll(key).filter((v): v is string => typeof v === "string" && v !== "");
}

/** Un elemento por cada línea no vacía de un textarea. */
export function lines(fd: FormData, key: string): string[] {
  return str(fd, key)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Valores separados por comas. */
export function csv(fd: FormData, key: string): string[] {
  return str(fd, key)
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Textarea con JSON; vacío → null, mal formado → un centinela que no pasa la validación. */
export function json(fd: FormData, key: string): unknown {
  const raw = str(fd, key).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { __invalidJson: true };
  }
}

/** "url | alt | caption" por línea. */
export function images(fd: FormData, key: string) {
  return lines(fd, key).map((l) => {
    const [url = "", alt = "", caption = ""] = l.split("|").map((p) => p.trim());
    return { url, alt, caption };
  });
}

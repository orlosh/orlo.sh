import { z } from "zod";

/**
 * Constructor mínimo de esquemas que produce a la vez el JSON Schema que se envía a Gemini
 * (salida estructurada) y el esquema de Zod con el que se valida la respuesta. Una sola
 * definición: lo que se pide y lo que se acepta no pueden divergir.
 *
 * Solo usa la parte de JSON Schema que Gemini documenta (type, properties, required, items,
 * enum, minimum/maximum, description). Los campos opcionales se omiten en `required` en lugar
 * de usar null; la validación es tolerante (un campo mal formado se descarta, no tumba todo).
 */

export type JsonSchema = Record<string, unknown>;
export type Spec<T> = { json: JsonSchema; zod: z.ZodType<T> };

const withDesc = (json: JsonSchema, description?: string) => (description ? { ...json, description } : json);

export const S = {
  str: (description?: string): Spec<string> => ({
    json: withDesc({ type: "string" }, description),
    zod: z.string().trim(),
  }),
  int: (min: number, max: number, description?: string): Spec<number> => ({
    json: withDesc({ type: "integer", minimum: min, maximum: max }, description),
    zod: z.coerce.number().transform((n) => Math.round(Math.min(max, Math.max(min, n)))),
  }),
  num: (description?: string): Spec<number> => ({
    json: withDesc({ type: "number" }, description),
    zod: z.coerce.number().refine(Number.isFinite),
  }),
  bool: (description?: string): Spec<boolean> => ({
    json: withDesc({ type: "boolean" }, description),
    zod: z.boolean(),
  }),
  enum: <T extends string>(values: readonly [T, ...T[]], description?: string): Spec<T> => ({
    json: withDesc({ type: "string", enum: [...values] }, description),
    zod: z.enum(values as [T, ...T[]]) as unknown as z.ZodType<T>,
  }),
  arr: <T>(item: Spec<T>, max: number, description?: string): Spec<T[]> => ({
    json: withDesc({ type: "array", items: item.json, maxItems: max }, description),
    // Los elementos inválidos se descartan uno a uno.
    zod: z
      .array(z.unknown())
      .transform((list) => list.flatMap((x) => {
        const r = item.zod.safeParse(x);
        return r.success ? [r.data] : [];
      }).slice(0, max)),
  }),
  obj: <R extends Record<string, Spec<unknown>>, O extends Record<string, Spec<unknown>> = Record<string, never>>(
    required: R,
    optional: O = {} as O,
    description?: string,
  ): Spec<{ [K in keyof R]: R[K] extends Spec<infer T> ? T : never } & { [K in keyof O]?: O[K] extends Spec<infer T> ? T : never }> => {
    const properties = Object.fromEntries([...Object.entries(required), ...Object.entries(optional)].map(([k, v]) => [k, v.json]));
    const shape: Record<string, z.ZodType> = {};
    for (const [k, v] of Object.entries(required)) shape[k] = v.zod;
    // Un opcional inválido o vacío pasa a undefined en lugar de invalidar el objeto.
    for (const [k, v] of Object.entries(optional)) {
      shape[k] = z.preprocess((x) => (x === null || x === "" ? undefined : x), v.zod.optional()).catch(undefined);
    }
    return {
      json: withDesc({ type: "object", properties, required: Object.keys(required) }, description),
      zod: z.object(shape) as never,
    };
  },
};

export type Infer<T> = T extends Spec<infer U> ? U : never;

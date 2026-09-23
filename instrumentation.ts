import type { Instrumentation } from "next";

/**
 * Todo error de servidor no gestionado (render de página, Server Action, Route Handler)
 * va al log estructurado con su digest, el mismo ID que la página de error
 * muestra al visitante, para poder asociar el aviso de un usuario a una línea de log.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("./lib/logger");
  const e = err as Error & { digest?: string };
  // El cliente se fue a mitad del stream (navegación, pestaña cerrada): no es fallo del servidor.
  if (e.message === "The destination stream closed early.") {
    logger.info({ path: request.path }, "client aborted response");
    return;
  }
  logger.error(
    {
      err: { message: e.message, stack: e.stack, digest: e.digest },
      method: request.method,
      path: request.path,
      routeType: context.routeType,
      routePath: context.routePath,
    },
    "unhandled request error",
  );
};

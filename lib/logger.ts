import "server-only";
import pino from "pino";

/**
 * Logs JSON estructurados en stdout. El runtime de contenedores (Docker) recoge
 * stdout, así que la app nunca gestiona por sí misma ficheros de log ni su rotación.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "portfolio", version: process.env.APP_VERSION ?? "dev" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    // Defensa en profundidad: que las credenciales nunca lleguen a los logs.
    paths: [
      "password",
      "*.password",
      "headers.cookie",
      "headers.authorization",
      "req.headers.cookie",
      "req.headers.authorization",
    ],
    censor: "[redacted]",
  },
  formatters: { level: (label) => ({ level: label }) },
});

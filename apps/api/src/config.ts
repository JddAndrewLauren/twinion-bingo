export type AppConfig = {
  /** Origins allowed to call this API from a browser, plus their Vercel previews. */
  allowedOrigins: string[];
};

export type ServerConfig = AppConfig & { port: number };

const DEFAULT_PORT = 8080;
const LOCAL_WEB_ORIGIN = 'http://localhost:3000';

/**
 * Reads the config the server needs, throwing rather than starting on anything
 * missing or malformed. A silently-wrong origin yields an API that passes its
 * health check and that no browser can call.
 */
export function resolveServerConfig(
  env: Record<string, string | undefined>,
): ServerConfig {
  return { allowedOrigins: resolveAllowedOrigins(env), port: resolvePort(env) };
}

function resolveAllowedOrigins(
  env: Record<string, string | undefined>,
): string[] {
  const origins = (env.WEB_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');

  if (origins.length > 0) return origins;

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'WEB_ORIGIN must list at least one origin in production ' +
        '(comma-separated); refusing to start with a localhost default.',
    );
  }

  return [LOCAL_WEB_ORIGIN];
}

function resolvePort(env: Record<string, string | undefined>): number {
  if (env.PORT === undefined) return DEFAULT_PORT;

  const port = Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `PORT must be a port number, got ${JSON.stringify(env.PORT)}.`,
    );
  }

  return port;
}

/**
 * Vercel gives every preview deployment its own hostname, so previews can't be
 * listed ahead of time. Allow them, but only under the configured project's own
 * prefix — `twinion-bingo-web.vercel.app` admits
 * `twinion-bingo-web-<anything>.vercel.app` and nothing else.
 */
export function isOriginAllowed(
  origin: string,
  allowedOrigins: string[],
): boolean {
  if (allowedOrigins.includes(origin)) return true;

  return allowedOrigins.some((allowed) =>
    vercelPreviewPattern(allowed)?.test(origin),
  );
}

function vercelPreviewPattern(allowedOrigin: string): RegExp | undefined {
  const project = /^https:\/\/([a-z0-9-]+)\.vercel\.app$/.exec(
    allowedOrigin,
  )?.[1];

  return project === undefined
    ? undefined
    : new RegExp(`^https://${project}-[a-z0-9-]+\\.vercel\\.app$`);
}

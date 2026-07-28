import { describe, expect, it } from 'vitest';
import { resolveServerConfig } from '../src/config.js';

describe('resolving server config from the environment', () => {
  it('reads a single web origin', () => {
    const config = resolveServerConfig({ WEB_ORIGIN: 'https://bingo.example' });

    expect(config.allowedOrigins).toEqual(['https://bingo.example']);
  });

  it('reads a comma-separated list of web origins', () => {
    const config = resolveServerConfig({
      WEB_ORIGIN: 'https://bingo.example, http://localhost:3000',
    });

    expect(config.allowedOrigins).toEqual([
      'https://bingo.example',
      'http://localhost:3000',
    ]);
  });

  it('falls back to the local web app outside production', () => {
    const config = resolveServerConfig({});

    expect(config.allowedOrigins).toEqual(['http://localhost:3000']);
  });

  it('refuses to start in production without a web origin', () => {
    expect(() => resolveServerConfig({ NODE_ENV: 'production' })).toThrow(
      /WEB_ORIGIN/,
    );
  });

  it('refuses to start in production when the web origin is only separators', () => {
    expect(() =>
      resolveServerConfig({ NODE_ENV: 'production', WEB_ORIGIN: ' , ' }),
    ).toThrow(/WEB_ORIGIN/);
  });

  it('defaults the port to the one fly.toml forwards to', () => {
    const config = resolveServerConfig({});

    expect(config.port).toBe(8080);
  });

  it('reads the port from the environment', () => {
    const config = resolveServerConfig({ PORT: '3001' });

    expect(config.port).toBe(3001);
  });

  it('refuses to start on a port that is not a number', () => {
    expect(() => resolveServerConfig({ PORT: 'eight thousand' })).toThrow(
      /PORT/,
    );
  });
});

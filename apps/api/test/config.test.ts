import { describe, expect, it } from 'vitest';
import { resolveServerConfig } from '../src/config.js';

/** Required in every environment now, so every case below has to carry it. */
const DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:55432/postgres';

describe('resolving server config from the environment', () => {
  it('reads a single web origin', () => {
    const config = resolveServerConfig({
      DATABASE_URL,
      WEB_ORIGIN: 'https://bingo.example',
    });

    expect(config.allowedOrigins).toEqual(['https://bingo.example']);
  });

  it('reads a comma-separated list of web origins', () => {
    const config = resolveServerConfig({
      DATABASE_URL,
      WEB_ORIGIN: 'https://bingo.example, http://localhost:3000',
    });

    expect(config.allowedOrigins).toEqual([
      'https://bingo.example',
      'http://localhost:3000',
    ]);
  });

  it('falls back to the local web app outside production', () => {
    const config = resolveServerConfig({ DATABASE_URL });

    expect(config.allowedOrigins).toEqual(['http://localhost:3000']);
  });

  it('refuses to start in production without a web origin', () => {
    expect(() =>
      resolveServerConfig({ DATABASE_URL, NODE_ENV: 'production' }),
    ).toThrow(/WEB_ORIGIN/);
  });

  it('refuses to start in production when the web origin is only separators', () => {
    expect(() =>
      resolveServerConfig({
        DATABASE_URL,
        NODE_ENV: 'production',
        WEB_ORIGIN: ' , ',
      }),
    ).toThrow(/WEB_ORIGIN/);
  });

  it('reads the database connection string', () => {
    const config = resolveServerConfig({ DATABASE_URL });

    expect(config.databaseUrl).toBe(DATABASE_URL);
  });

  it('refuses to start without a database, even outside production', () => {
    expect(() => resolveServerConfig({})).toThrow(/DATABASE_URL/);
  });

  it('refuses to start when the database connection string is blank', () => {
    expect(() => resolveServerConfig({ DATABASE_URL: '  ' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('defaults the port to the one fly.toml forwards to', () => {
    const config = resolveServerConfig({ DATABASE_URL });

    expect(config.port).toBe(8080);
  });

  it('reads the port from the environment', () => {
    const config = resolveServerConfig({ DATABASE_URL, PORT: '3001' });

    expect(config.port).toBe(3001);
  });

  it('refuses to start on a port that is not a number', () => {
    expect(() =>
      resolveServerConfig({ DATABASE_URL, PORT: 'eight thousand' }),
    ).toThrow(/PORT/);
  });

  it('reads the admin secret', () => {
    const config = resolveServerConfig({ DATABASE_URL, ADMIN_SECRET: 'lax-paddock' });

    expect(config.adminSecret).toBe('lax-paddock');
  });

  it('leaves the admin secret undefined when unset, in every environment', () => {
    const config = resolveServerConfig({ DATABASE_URL, NODE_ENV: 'production', WEB_ORIGIN: 'https://bingo.example' });

    expect(config.adminSecret).toBeUndefined();
  });

  it('treats a blank admin secret the same as unset', () => {
    const config = resolveServerConfig({ DATABASE_URL, ADMIN_SECRET: '   ' });

    expect(config.adminSecret).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { unconnectedDb } from './support/db.js';

describe('health route', () => {
  it('reports the service is up', async () => {
    const app = createApp({
      allowedOrigins: ['https://bingo.example'],
      db: unconnectedDb(),
    });

    const res = await app.request('/health');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok' });
  });
});

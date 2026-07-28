import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('health route', () => {
  it('reports the service is up', async () => {
    const app = createApp({ webOrigin: 'https://bingo.example' });

    const res = await app.request('/health');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok' });
  });
});

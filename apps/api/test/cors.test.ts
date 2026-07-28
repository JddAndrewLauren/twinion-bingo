import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('cross-origin access', () => {
  it('lets the web app fetch from the browser', async () => {
    const app = createApp({ webOrigin: 'https://bingo.example' });

    const res = await app.request('/health', {
      headers: { Origin: 'https://bingo.example' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://bingo.example',
    );
  });

  it('refuses an origin that is not the web app', async () => {
    const app = createApp({ webOrigin: 'https://bingo.example' });

    const res = await app.request('/health', {
      headers: { Origin: 'https://evil.example' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

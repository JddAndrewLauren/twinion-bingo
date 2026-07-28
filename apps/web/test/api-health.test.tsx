import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiHealth } from '../app/api-health';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api health panel', () => {
  it('shows the status the API reports', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status: 'ok' })),
    );

    render(<ApiHealth apiUrl="https://api.example" />);

    expect(await screen.findByText('API: ok')).toBeDefined();
  });

  it('says so when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    render(<ApiHealth apiUrl="https://api.example" />);

    expect(await screen.findByText('API: unreachable')).toBeDefined();
  });
});

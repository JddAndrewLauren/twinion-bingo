import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiHealth } from '../app/api-health';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A fetch that never answers, and rejects the way the platform does on abort. */
function neverAnswers() {
  return vi.fn(
    (_url: string, init?: { signal?: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      }),
  );
}

describe('api health panel', () => {
  it('shows the status the API reports', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status: 'ok' })),
    );

    render(<ApiHealth apiUrl="https://api.example" />);

    expect(await screen.findByText('API: ok')).toBeDefined();
  });

  it('waits visibly rather than claiming an answer it does not have', () => {
    vi.stubGlobal('fetch', neverAnswers());

    render(<ApiHealth apiUrl="https://api.example" />);

    expect(screen.getByText('API: checking…')).toBeDefined();
  });

  it('distinguishes a reachable API that is failing from an unreachable one', async () => {
    const fetching = vi.fn(async () =>
      Response.json({ error: 'boom' }, { status: 500 }),
    );
    vi.stubGlobal('fetch', fetching);

    render(<ApiHealth apiUrl="https://api.example" />);

    expect(await screen.findByText('API: error 500')).toBeDefined();
    // A reply is an answer: asking a second time would not change it.
    expect(fetching).toHaveBeenCalledTimes(1);
  });

  it('does not render an undefined status when a 2xx body is not the health JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ nothing: 'useful' })),
    );

    render(<ApiHealth apiUrl="https://api.example" />);

    expect(await screen.findByText('API: bad reply')).toBeDefined();
  });

  it('says so when the API cannot be reached, after one retry', async () => {
    const fetching = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetching);

    render(<ApiHealth apiUrl="https://api.example" />);

    expect(await screen.findByText('API: unreachable')).toBeDefined();
    expect(fetching).toHaveBeenCalledTimes(2);
  });

  it('gives up on a request that never answers, and says it timed out', async () => {
    vi.useFakeTimers();
    const fetching = neverAnswers();
    vi.stubGlobal('fetch', fetching);

    render(<ApiHealth apiUrl="https://api.example" />);

    // Both attempts' budgets: a cold start gets a second chance before this
    // reads as a failure.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(screen.getByText('API: timed out')).toBeDefined();
    expect(fetching).toHaveBeenCalledTimes(2);
  });

  it('aborts the in-flight probe when the panel unmounts', () => {
    const fetching = neverAnswers();
    vi.stubGlobal('fetch', fetching);

    const { unmount } = render(<ApiHealth apiUrl="https://api.example" />);
    const signal = fetching.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);

    unmount();

    expect(signal?.aborted).toBe(true);
  });
});

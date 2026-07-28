import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateOrJoin } from '../app/create-or-join';

const push = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('starting a room', () => {
  it('creates it, keeps the host token, and opens the room', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          code: 'WXYZ',
          token: 'host-token',
          player: { id: 'host-id', name: 'Ash', joinSeq: 1 },
        }),
      ),
    );

    render(<CreateOrJoin apiUrl="https://api.example" />);

    fireEvent.change(screen.getByLabelText('Your name'), {
      target: { value: 'Ash' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create a room' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/r/WXYZ'));
    expect(window.localStorage.getItem('twinion-bingo:token:WXYZ')).toBe(
      'host-token',
    );
  });

  it('says so when the room could not be created', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 500 })),
    );

    render(<CreateOrJoin apiUrl="https://api.example" />);

    fireEvent.change(screen.getByLabelText('Your name'), {
      target: { value: 'Ash' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create a room' }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('the code entry fallback', () => {
  it('opens the room a code was read aloud for', () => {
    render(<CreateOrJoin apiUrl="https://api.example" />);

    fireEvent.change(screen.getByLabelText('Room code'), {
      target: { value: 'abcd' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    expect(push).toHaveBeenCalledWith('/r/ABCD');
  });

  it('keeps the join button off until a full code is typed', () => {
    render(<CreateOrJoin apiUrl="https://api.example" />);

    const join = screen.getByRole('button', { name: 'Join' });
    expect(join.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('Room code'), {
      target: { value: 'ABC' },
    });
    expect(join.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('Room code'), {
      target: { value: 'ABCD' },
    });
    expect(join.hasAttribute('disabled')).toBe(false);
  });
});

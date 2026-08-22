import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SkinButton } from '../app/skin-button';

afterEach(() => {
  document.cookie = 'twinion_bingo_skin=; path=/; max-age=0';
  delete document.documentElement.dataset.skin;
});

describe('the skin button', () => {
  it('advances the fixed cycle, writes the cookie and sets data-skin on <html>', () => {
    render(<SkinButton initialSkin="pitwall" />);

    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));

    expect(document.documentElement.dataset.skin).toBe('slipstream');
    expect(document.cookie).toContain('twinion_bingo_skin=slipstream');

    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));

    expect(document.documentElement.dataset.skin).toBe('confetti');
    expect(document.cookie).toContain('twinion_bingo_skin=confetti');
  });

  it('names no skin other than the current one', () => {
    render(<SkinButton initialSkin="scorecard" />);

    expect(screen.getByRole('button', { name: 'Theme' }).textContent).toBe(
      '↻ Theme',
    );
  });
});

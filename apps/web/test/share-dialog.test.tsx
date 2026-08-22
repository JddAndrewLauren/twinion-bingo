import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareRoom } from '../app/r/[code]/share-dialog';

const shareLink = 'https://bingo.example/r/ABCD';

/**
 * What is asserted here is the wiring: what the dialog holds, what it encodes, and
 * the three answers a copy can give. What is *not* asserted here is modality —
 * Escape, the focus trap, the platform's own focus restore — because jsdom implements
 * none of it and `test/setup.ts` only models the open/closed state. Those claims are
 * real in WebKit and are gated in `gate/share.gate.ts`.
 *
 * The one focus claim that does belong here is the app's own: `onClose` focuses the
 * trigger, which runs off the `close` event the polyfill does dispatch.
 */
function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Share room' }));
}

/** The dialog is `display: none` while closed, so it is queried rather than seen. */
function panel() {
  return screen.getByRole('dialog', { hidden: true });
}

/** No clipboard at all is jsdom's default; a test that wants one puts it back. */
function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(writeText) },
  });

  return navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.restoreAllMocks();
});

describe('the share dialog', () => {
  it('is in the document but closed until Share room is tapped', () => {
    render(<ShareRoom code="ABCD" shareLink={shareLink} />);

    expect(panel().getAttribute('open')).toBeNull();

    open();

    expect(panel().getAttribute('open')).not.toBeNull();
  });

  it('opens it modally, which is what buys Escape and the focus trap', () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    render(<ShareRoom code="ABCD" shareLink={shareLink} />);

    open();

    expect(showModal).toHaveBeenCalledTimes(1);
  });

  it('encodes the canonical room URL in the QR', () => {
    render(<ShareRoom code="ABCD" shareLink={shareLink} />);
    open();

    // The SVG `<title>` is the QR's accessible name and the only honest way to read
    // back what it encodes from an environment that paints nothing. Inside an SVG,
    // `getByTitle` matches the `<title>` node itself rather than its owner.
    const title = within(panel()).getByTitle(shareLink);
    expect(title.tagName.toLowerCase()).toBe('title');
    expect(title.parentElement?.tagName.toLowerCase()).toBe('svg');
  });

  it('carries the room code and the link itself', () => {
    render(<ShareRoom code="ABCD" shareLink={shareLink} />);
    open();

    const dialog = within(panel());
    expect(dialog.getByText('ABCD')).toBeDefined();
    expect(dialog.getByRole('link', { name: shareLink }).getAttribute('href')).toBe(
      shareLink,
    );
  });

  it('copies the link and says so', async () => {
    const writeText = stubClipboard(async () => {});
    render(<ShareRoom code="ABCD" shareLink={shareLink} />);
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(await screen.findByText('Link copied')).toBeDefined();
    expect(writeText).toHaveBeenCalledWith(shareLink);
  });

  it('names the link to press and hold when the copy is refused', async () => {
    stubClipboard(async () => {
      throw new Error('denied');
    });
    render(<ShareRoom code="ABCD" shareLink={shareLink} />);
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(
      await screen.findByText('Could not copy — press and hold the link above.'),
    ).toBeDefined();
    expect(screen.queryByText('Link copied')).toBeNull();
  });

  /**
   * The LAN case, and the reason the fallback exists: the Clipboard API needs a secure
   * context, and this app is served over `http://<LAN-ip>:3000` to the phones it is
   * played on. There `navigator.clipboard` is undefined outright, so the failure is
   * thrown on property access rather than by a rejected promise.
   */
  it('answers the same way when there is no clipboard at all', async () => {
    render(<ShareRoom code="ABCD" shareLink={shareLink} />);
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(
      await screen.findByText('Could not copy — press and hold the link above.'),
    ).toBeDefined();
  });

  it('closes on Close and forgets the copy feedback on the way back in', async () => {
    stubClipboard(async () => {});
    render(<ShareRoom code="ABCD" shareLink={shareLink} />);
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await screen.findByText('Link copied');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(panel().getAttribute('open')).toBeNull();

    open();

    await waitFor(() => expect(screen.queryByText('Link copied')).toBeNull());
  });

  /**
   * WebKit does not focus a `<button>` on tap, so a tapped-open dialog leaves the
   * platform nothing to restore focus to and it ends up on the closed `<dialog>` —
   * `display: none`, so the next step lands at the top of the document. `onClose`
   * doing it explicitly is the app's, which is why it is asserted here and not only
   * in the gate.
   */
  it('puts focus back on the trigger when it closes', () => {
    render(<ShareRoom code="ABCD" shareLink={shareLink} />);
    const share = screen.getByRole('button', { name: 'Share room' });

    open();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(document.activeElement).toBe(share);
  });
});

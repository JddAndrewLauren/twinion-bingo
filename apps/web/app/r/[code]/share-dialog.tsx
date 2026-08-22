'use client';

import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

/**
 * The one way to hand this room to somebody else, offered from every state where the
 * room has resolved.
 *
 * Trigger and dialog are one component rather than two on purpose: a modal `<dialog>`
 * restores focus to whatever invoked it, and keeping the invoker a sibling of the
 * dialog is what makes that correct for free at all four call sites — nothing has to
 * be threaded, and there is no second focus path to keep in step.
 */
/**
 * The real `autofocus` *attribute*, which is not React's `autoFocus` prop. That prop
 * is a `.focus()` call at mount, and at mount this dialog is `display: none`, so it
 * does nothing at all; only the attribute is read by the platform's own dialog
 * focusing steps, which run at `showModal()`. Measured in WebKit: with the prop,
 * focus opened on the link — the first focusable — and with the attribute it opens on
 * the primary action, which is what a dialog with one obvious next tap should do.
 */
const AUTOFOCUS = { autofocus: '' };

export function ShareRoom({ code, shareLink }: { code: string; shareLink: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');

  /**
   * One `try` around the whole call, because there are two real failures and only one
   * of them is a rejected promise: `navigator.clipboard` is `undefined` outside a
   * secure context, so reading `.writeText` off it throws. That is the ordinary case
   * here rather than an exotic one — this app is served over `http://<LAN-ip>:3000`
   * to the phones it is played on, which is the device a host shares from.
   *
   * The fallback is a message, not a hidden-textarea `execCommand('copy')` shim:
   * `execCommand` is deprecated and blocked in the same places, and it would add a
   * second copy path no test could tell from the first. What makes a failed copy
   * survivable is already in the dialog — a scannable QR, and the full URL as
   * selectable, long-pressable anchor text — so the fallback's job is only to say the
   * tap did not take and point at them.
   */
  async function copy() {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  }

  return (
    <>
      {/*
        `type="button"` is load-bearing: one call site is inside the join `<form>`, and
        a bare button there submits it. `shrink-0` is for the game screen's slim bar,
        where this is the third item on a row that must not widen.

        The label reads "Share" and the accessible name is still "Share room": the slim
        bar is the tightest call site. "Share room" measured 104px there, which was 30px
        past the row and wrapped *both* the room code and the statistics onto second
        lines — a 44px header became 69px, out of the card's own height. "Share" at
        `px-2` is 55.2px, which fits with the bar's own `px-2`/`gap-2`. The accessible
        name is the longer one because the gate, the tests and a screen reader all want
        the noun, and it contains the visible label, so a voice user saying "tap Share"
        still hits it.
      */}
      <button
        ref={trigger}
        type="button"
        aria-label="Share room"
        onClick={() => {
          setCopied('idle');
          dialog.current?.showModal();
        }}
        className="min-h-11 shrink-0 rounded border border-rule px-2 text-sm font-semibold"
      >
        Share
      </button>
      {/*
        Always rendered, never conditionally mounted: a closed `<dialog>` is
        `display: none` by the UA sheet — in browsers and in jsdom — so mounting it on
        demand buys no hiding and costs the ref that opens it.

        `m-auto` is not decoration. Centring a modal `<dialog>` is the UA sheet's
        `margin: auto`, and Tailwind's preflight zeroes every margin — so without it
        this measured 320x544 at x=0, y=0 on all four viewports: a panel in the corner
        of an 834x1194 iPad, whole on screen and plainly wrong.
      */}
      <dialog
        ref={dialog}
        aria-label={`Share room ${code}`}
        /*
          The platform's own focus restore only has somewhere to go if the invoker was
          focused, and WebKit does not focus a `<button>` on tap — measured at
          `phone-small`: after a tapped open and a tapped Close, `document.activeElement`
          was the closed `<dialog>` itself, which is `display: none`. So the next Tab or
          VoiceOver step restarts from the top of the document rather than beside the
          trigger. Focusing it here is what the platform would have done, and for the
          keyboard path — where it did it already — this lands on the same element.
        */
        onClose={() => {
          setCopied('idle');
          trigger.current?.focus();
        }}
        className="m-auto w-[min(20rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded border border-rule bg-raised p-4 text-ink-strong backdrop:bg-black/70"
      >
        <div className="flex flex-col gap-3">
          {/*
            High contrast is black on white *plus* the white quiet zone around it: a QR
            drawn straight onto `neutral-900` is the classic unscannable one. The quiet
            zone is the QR spec's four modules, carried by `marginSize` rather than by
            the wrapper's padding: at the rendered 270px this is a 33-module symbol, so
            `p-2`'s 8px is under one module and cannot make up a shortfall. `title`
            renders an SVG `<title>`, which is both the accessible name and the only
            honest way to assert the encoded value without a test-only attribute.
          */}
          <div className="rounded bg-white p-2">
            <QRCodeSVG
              value={shareLink}
              title={shareLink}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
              marginSize={4}
              size={256}
              className="h-auto w-full"
            />
          </div>
          <p className="text-center text-2xl font-semibold tracking-widest">{code}</p>
          {/*
            `break-all` because this is a full `https://host/r/CODE` in a ~320px panel,
            which is the wrap risk the lobby's retired share line was gated for; and
            `flex items-center` so the row actually reaches a thumb's 44px.
          */}
          <a
            href={shareLink}
            className="flex min-h-11 items-center break-all underline"
          >
            {shareLink}
          </a>
          <button
            type="button"
            onClick={copy}
            {...AUTOFOCUS}
            className="min-h-11 rounded border border-rule font-semibold"
          >
            Copy link
          </button>
          <p role="status">
            {copied === 'done'
              ? 'Link copied'
              : copied === 'failed'
                ? 'Could not copy — press and hold the link above.'
                : ''}
          </p>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="min-h-11 rounded border border-rule-strong font-semibold"
          >
            Close
          </button>
        </div>
      </dialog>
    </>
  );
}

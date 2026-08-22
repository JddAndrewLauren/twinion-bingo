/**
 * The shared class string for a form's primary submit button.
 *
 * `min-h-11` is 44px, Apple's documented minimum. **Join** and **Start game** on the
 * room screen were bare `<button>` elements and therefore 24px tall — a target no
 * thumb reliably hits — found by #13's gate rather than by review, the same way #12
 * found its own 22x24px switcher. #68 found the same defect on the home screen's two
 * submit buttons and lifted this constant out of `room-screen.tsx` so both screens
 * style a submit button one way rather than two.
 */
export const ACTION_BUTTON =
  'min-h-11 rounded border border-neutral-700 px-3 font-semibold disabled:text-neutral-500';

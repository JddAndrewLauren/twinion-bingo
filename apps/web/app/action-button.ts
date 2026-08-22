/**
 * The shared class string for a form's primary submit button.
 *
 * `min-h-11` is 44px, Apple's documented minimum. **Join** and **Start game** on the
 * room screen were bare `<button>` elements and therefore 24px tall — a target no
 * thumb reliably hits — found by #13's gate rather than by review, the same way #12
 * found its own 22x24px switcher. #68 found the same defect on the home screen's two
 * submit buttons and lifted this constant out of `room-screen.tsx` so both screens
 * style a submit button one way rather than two.
 *
 * **No skin hook lives here.** #104 briefly carried a bare `action-button` class on
 * this constant so one selector could re-skin "every primary action"; that painted the
 * home screen's two co-equal forms and the card screen's *Re-roll card* / *Start game*
 * in the join screen's accent fill, which no mock in `docs/design/` shows. The accent
 * treatment is a property of *the join screen's single primary action*, so it is a
 * class at that one call site (`.skin-action-primary`) and this constant keeps only
 * what every submit button shares. `rounded-skin` (rather than a literal `rounded`) is
 * what makes the corner a per-skin token — 0 in Pit Wall, per the handoff's
 * "Radius 0 everywhere".
 */
export const ACTION_BUTTON =
  'min-h-11 rounded-skin border border-rule px-3 font-semibold disabled:text-muted-soft';

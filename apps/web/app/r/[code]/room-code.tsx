/**
 * The room code, as four separate boxed characters — a structural piece #104
 * builds because the app did not have one: the code used to be plain text in
 * the join heading, and the handoff's per-theme "Room code treatment" table
 * (`docs/design/README.md`) draws every skin's own box, gradient or ticket
 * around this same four-character string.
 *
 * One React tree for every skin, per this issue's "keep it in CSS, not in
 * TSX": the four spans are unconditional, and only Pit Wall's own
 * `[data-skin='pitwall'] .skin-code` rule in `globals.css` paints them as
 * boxes. Every other skin sees four bare characters until its own slice adds
 * its rule — visually a no-op for now, since no skin but Pit Wall has ever
 * boxed this string.
 *
 * `code` is always exactly four characters (`CODE_LENGTH` in `room-api.ts`'s
 * callers), so splitting on `[...code]` rather than assuming ASCII is a
 * precaution that costs nothing here.
 *
 * `text-2xl` is the *unskinned* size — the fallback every skin without a rule of
 * its own still reads at. Pit Wall's own 38px/52px is in `globals.css`
 * (`.skin-code span`), because it is the handoff's number for one skin and not a
 * shared default; putting it here would make the other three inherit a size
 * their own tables do not name.
 *
 * #105 (Slipstream): the `<span aria-hidden className="skin-code-bar">` below the
 * `<p>` is the sheared bar under the one-word room code — a sibling of the `<p>`
 * rather than a fifth child *inside* it, because `gate/skin-pitwall.gate.ts` counts
 * `code.locator('span')` and asserts exactly 4 (the four boxed characters). It
 * renders unconditionally, the same "one React tree for every skin" pattern the
 * four character spans already use, and is a visual no-op for every skin but
 * Slipstream until its own `[data-skin='X'] .skin-code-bar` rule exists.
 */
export function RoomCode({ code }: { code: string }) {
  return (
    <>
      <p aria-label={`Room code ${code}`} className="skin-code flex gap-2">
        {[...code].map((character, index) => (
          <span
            key={index}
            aria-hidden
            className="flex flex-1 items-center justify-center rounded-skin border border-rule text-2xl font-bold"
          >
            {character}
          </span>
        ))}
      </p>
      <span aria-hidden className="skin-code-bar hidden" />
    </>
  );
}

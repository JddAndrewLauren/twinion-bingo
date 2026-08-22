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
 */
export function RoomCode({ code }: { code: string }) {
  return (
    <p aria-label={`Room code ${code}`} className="skin-code flex gap-2">
      {[...code].map((character, index) => (
        <span
          key={index}
          aria-hidden
          className="flex flex-1 items-center justify-center rounded border border-rule text-2xl font-bold"
        >
          {character}
        </span>
      ))}
    </p>
  );
}

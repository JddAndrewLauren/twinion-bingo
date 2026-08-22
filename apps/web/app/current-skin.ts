import { cookies } from 'next/headers';
import { parseSkin, SKIN_COOKIE, type Skin } from './skin';

/**
 * The skin a request is rendering, read once from the cookie `skin-button.tsx`
 * writes. Server-only (`next/headers`), so it lives in its own module rather
 * than in `skin.ts` — that file is imported by the client `SkinButton` too, and
 * `next/headers` cannot ride along into a client bundle.
 *
 * One place for every server component that hands a client-rendered surface its
 * starting skin: `layout.tsx` for `<html data-skin>`, and — from #103 — the
 * brand bars in `page.tsx` and `r/[code]/page.tsx` that mount a `SkinButton`.
 */
export async function currentSkin(): Promise<Skin> {
  const store = await cookies();

  return parseSkin(store.get(SKIN_COOKIE)?.value);
}

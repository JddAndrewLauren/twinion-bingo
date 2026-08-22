import type { Metadata } from 'next';
import { ApiHealth } from './api-health';
import { CreateOrJoin } from './create-or-join';
import { currentSkin } from './current-skin';
import { SkinButton } from './skin-button';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

/*
  Relative, and resolved against the root layout's `metadataBase` — so the home
  page names the same origin a room's share link does. Set per page rather than
  in the layout on purpose: a canonical inherited by every route would have
  `/legibility` claiming to be `/`.
*/
export const metadata: Metadata = { alternates: { canonical: '/' } };

export default async function Home() {
  // #103: the theme button's every mount reads the cookie server-side, the same
  // way `layout.tsx` does for `<html data-skin>`, so it opens on the skin the
  // player actually left it on rather than flashing back to `pitwall`.
  const skin = await currentSkin();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">TwinIon Bingo</h1>
        <SkinButton initialSkin={skin} />
      </div>
      <CreateOrJoin apiUrl={apiUrl} />
      <ApiHealth apiUrl={apiUrl} />
    </main>
  );
}

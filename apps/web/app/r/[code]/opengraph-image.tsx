import { ImageResponse } from 'next/og';
import { fetchRoster } from '../../room-api';
import { themeName } from '../../theme-name';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'A TwinIon Bingo room';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

/** Long enough for a healthy API, short enough that an unfurler does not give up. */
const THEME_TIMEOUT_MS = 1500;

/**
 * The card a group chat shows when somebody pastes the share link — which is the
 * primary join path, so this is most players' first sight of the room.
 *
 * **This is where the room's theme is fetched, rather than in
 * `generateMetadata`.** Metadata blocks the room page's initial HTML and is paid
 * by every player opening the room; this route is hit by unfurlers alone. So the
 * round-trip lands here, and the code — which is free, it is in the path — is
 * drawn either way.
 *
 * The fallback is not decorative. The visual gate builds and serves with
 * `NEXT_PUBLIC_API_URL=http://api.gate.invalid`, so an unguarded fetch here is a
 * 500 in CI; and in production an unfurler is a third party with its own patience,
 * so a card that waits on a slow API is a link that unfurls as nothing at all.
 */
async function themeFor(code: string): Promise<string | undefined> {
  try {
    // The roster endpoint is public — a token only decides whether `you` is
    // filled in, and this is nobody.
    const roster = await fetchRoster(
      apiUrl,
      code,
      undefined,
      AbortSignal.timeout(THEME_TIMEOUT_MS),
    );

    return roster === undefined ? undefined : themeName(roster.themeId);
  } catch {
    return undefined;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const code = (await params).code.trim().toUpperCase();
  const theme = await themeFor(code);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          // `neutral-950`, matching the app — dark is the only theme.
          background: '#0a0a0a',
          color: '#fafafa',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 40, color: '#a3a3a3', letterSpacing: 8 }}>
          {theme === undefined ? 'TWINION BINGO' : theme.toUpperCase()}
        </div>
        {/*
          The code is the whole point of the card: it is what somebody reads off a
          phone held up across a room, so it is the largest thing on it.
        */}
        <div style={{ fontSize: 260, fontWeight: 700, letterSpacing: 16 }}>
          {code}
        </div>
        <div style={{ fontSize: 44, color: '#34d399' }}>Tap to join</div>
      </div>
    ),
    size,
  );
}

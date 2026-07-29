import { headers } from 'next/headers';
import { RoomScreen } from './room-screen';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

/** The share link, and the primary way anyone but the host reaches a room. */
export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const room = code.trim().toUpperCase();

  // Built on the server from the request that arrived, so the link a player is
  // told to pass on is the same host they reached the app on.
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? 'localhost:3000';
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'http';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-6">
      <RoomScreen
        apiUrl={apiUrl}
        code={room}
        shareLink={`${proto}://${host}/r/${room}`}
      />
    </main>
  );
}

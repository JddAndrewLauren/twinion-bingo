import type { Metadata } from 'next';
import { RoomList } from './room-list';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

/**
 * Not for a search index or a crawler's unfurl — this is the one operator
 * surface in the app (#125), reached by whoever holds the shared secret, never
 * by a link anyone shares. `alternates.canonical` matches `page.tsx`'s own
 * reasoning: relative, resolved against the root layout's `metadataBase`.
 */
export const metadata: Metadata = {
  title: 'Admin — TwinIon Bingo',
  robots: { index: false, follow: false },
  alternates: { canonical: '/admin' },
};

export default function Admin() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Open rooms</h1>
      <RoomList apiUrl={apiUrl} />
    </main>
  );
}

import { ApiHealth } from './api-health';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-semibold">TwinIon Bingo</h1>
      <ApiHealth apiUrl={apiUrl} />
    </main>
  );
}

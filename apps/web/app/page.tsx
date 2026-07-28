import { ApiHealth } from './api-health';
import { CreateOrJoin } from './create-or-join';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">TwinIon Bingo</h1>
      <CreateOrJoin apiUrl={apiUrl} />
      <ApiHealth apiUrl={apiUrl} />
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';

export function ApiHealth({ apiUrl }: { apiUrl: string }) {
  const [status, setStatus] = useState('…');

  useEffect(() => {
    void fetch(`${apiUrl}/health`)
      .then((res) => res.json())
      .then((body: { status: string }) => setStatus(body.status))
      .catch(() => setStatus('unreachable'));
  }, [apiUrl]);

  return <p>API: {status}</p>;
}

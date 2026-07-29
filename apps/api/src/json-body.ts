/**
 * Every POST here takes a small JSON object and every one of them treats a body
 * that is absent, truncated or not JSON at all the same way: as a request with no
 * fields, which the route then rejects for the field it wanted. A phone that lost
 * signal mid-request is a 400 about the missing name or square, never a 500.
 */
export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * A room's age, as read at the track glancing at a phone rather than computed
 * client-side from a timestamp: the API sends `ageSeconds` fresh on every poll
 * (`admin-api.ts`), the same way `elapsedStamp` in the API sends a game's
 * elapsed time rather than the room screen deriving one from `Date.now()` — a
 * snapshot the gate can drive with a fixed number instead of racing the clock.
 */
export function formatAge(ageSeconds: number): string {
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

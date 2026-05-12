/** Open-Meteo updates most models hourly; older data is worth replacing. */
export const STALE_AFTER_MS = 30 * 60 * 1000;

/** True when a forecast fetched at `fetchedAt` should be reloaded at `now` (both ms). */
export function isStale(fetchedAt: number | null, now: number, maxAge = STALE_AFTER_MS): boolean {
	return fetchedAt === null || now - fetchedAt >= maxAge || now < fetchedAt;
}

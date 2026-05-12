import { describe, expect, it } from 'vitest';
import { isStale, STALE_AFTER_MS } from './freshness';

describe('isStale', () => {
	const t = Date.parse('2026-10-23T08:00:00Z');

	it('treats missing data as stale', () => {
		expect(isStale(null, t)).toBe(true);
	});

	it('keeps data younger than the limit', () => {
		expect(isStale(t, t + STALE_AFTER_MS - 1)).toBe(false);
	});

	it('expires data at the limit', () => {
		expect(isStale(t, t + STALE_AFTER_MS)).toBe(true);
	});

	it('refreshes if the clock went backwards', () => {
		expect(isStale(t, t - 1000)).toBe(true);
	});
});

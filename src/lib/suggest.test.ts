import { describe, expect, it } from 'vitest';
import { discomfort, suggestDeparture } from './suggest';
import { at, makeForecast } from './testing';
import { windowStats } from './window';

const opts = { units: 'metric' as const, timeZone: 'UTC' };
const leave = at('2026-10-23T17:30:00Z');

describe('discomfort', () => {
	it('is zero when dry and calm', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24);
		expect(discomfort(windowStats(f, leave, 20)!, 'walk')).toBe(0);
	});

	it('has no cliff at the gust threshold', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			8: { windGust: 34 },
			12: { windGust: 36 }
		});
		const below = discomfort(windowStats(f, at('2026-10-23T08:00:00Z'), 20)!, 'bike');
		const above = discomfort(windowStats(f, at('2026-10-23T12:00:00Z'), 20)!, 'bike');
		expect(above - below).toBeLessThan(0.1);
	});

	it('grows with rain chance, amount and gusts', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			8: { precipProbability: 50, precipitation: 1 },
			12: { precipProbability: 90, precipitation: 3, windGust: 60 }
		});
		const light = discomfort(windowStats(f, at('2026-10-23T08:00:00Z'), 20)!, 'walk');
		const heavy = discomfort(windowStats(f, at('2026-10-23T12:00:00Z'), 20)!, 'walk');
		expect(light).toBeGreaterThan(0);
		expect(heavy).toBeGreaterThan(light);
	});
});

describe('suggestDeparture', () => {
	it('returns null when the usual time is already fine', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24);
		expect(suggestDeparture(f, leave, 20, 'walk', opts)).toBeNull();
	});

	it('suggests leaving earlier to beat the rain', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			17: { precipProbability: 10 },
			18: { precipProbability: 80, precipitation: 2 },
			19: { precipProbability: 70, precipitation: 1.2 }
		});
		const s = suggestDeparture(f, leave, 20, 'walk', opts)!;
		// 17:15 still touches the 18:00 row; 17:00 to 17:20 only touches 17:00.
		expect(s.offsetMin).toBe(-30);
		expect(s.message).toBe('Leave 30 min earlier (17:00): rain chance 10% instead of 80%');
	});

	it('suggests leaving later once a gusty spell passes', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			8: { windGust: 50 },
			9: { windGust: 15 }
		});
		const s = suggestDeparture(f, at('2026-10-23T08:00:00Z'), 15, 'bike', opts)!;
		expect(s.offsetMin).toBe(45);
		expect(s.message).toBe('Leave 45 min later (08:45): gusts 15 km/h instead of 50 km/h');
	});

	it('prefers the smallest shift among equally good options', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, { 12: { precipProbability: 90 } });
		const s = suggestDeparture(f, at('2026-10-23T12:00:00Z'), 10, 'walk', opts)!;
		// 11:15 still touches the 12:00 row (it covers 11:30 to 12:30); 11:00 is clear.
		expect(s.offsetMin).toBe(-45);
	});

	it('ignores a gust dip just below the threshold (found in the London fixture)', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			7: { windGust: 34, precipProbability: 99 },
			8: { windGust: 36, precipProbability: 100 },
			9: { windGust: 36, precipProbability: 100 }
		});
		expect(suggestDeparture(f, at('2026-10-23T08:15:00Z'), 30, 'bike', opts)).toBeNull();
	});

	it('stays quiet when the usual trip is already fine for the mode', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			17: { precipProbability: 35 },
			18: { precipProbability: 35 }
		});
		expect(suggestDeparture(f, leave, 20, 'walk', opts)).toBeNull();
	});

	it('ignores marginal improvements', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			16: { precipProbability: 65 },
			17: { precipProbability: 70 },
			18: { precipProbability: 70 },
			19: { precipProbability: 65 }
		});
		expect(suggestDeparture(f, leave, 20, 'walk', opts)).toBeNull();
	});

	it('does not suggest leaving in the past', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			18: { precipProbability: 80 },
			19: { precipProbability: 80 }
		});
		const now = at('2026-10-23T17:10:00Z');
		expect(suggestDeparture(f, leave, 20, 'walk', { ...opts, now })).toBeNull();
		expect(suggestDeparture(f, leave, 20, 'walk', opts)?.offsetMin).toBe(-30);
	});

	it('uses mode thresholds: a shower that matters on a bike may not in a car', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			8: { precipProbability: 45, precipitation: 0.6 }
		});
		const start = at('2026-10-23T08:00:00Z');
		expect(suggestDeparture(f, start, 15, 'bike', opts)).not.toBeNull();
		expect(suggestDeparture(f, start, 15, 'car', opts)).toBeNull();
	});

	it('returns null when alternatives fall outside the forecast', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 2, { 0: { precipProbability: 90 } });
		expect(suggestDeparture(f, at('2026-10-23T00:00:00Z'), 10, 'walk', opts)?.offsetMin).toBe(45);
		expect(suggestDeparture(f, at('2026-10-23T05:00:00Z'), 10, 'walk', opts)).toBeNull();
	});

	it('words imperial gusts in mph', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			8: { windGust: 60 },
			9: { windGust: 20 }
		});
		const s = suggestDeparture(f, at('2026-10-23T08:00:00Z'), 15, 'walk', {
			...opts,
			units: 'imperial'
		})!;
		expect(s.message).toContain('gusts 12 mph instead of 37 mph');
	});
});

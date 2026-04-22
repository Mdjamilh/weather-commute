import { describe, expect, it } from 'vitest';
import { discomfort, suggestDeparture } from './suggest';
import { at, makeForecast } from './testing';
import { windowStats } from './window';

const opts = { units: 'metric' as const, timeZone: 'UTC' };
const leave = at('2026-10-23T17:30:00Z');

// Reminder: rain and gusts on the row stamped HH:00 describe the hour before it.

describe('discomfort', () => {
	it('is zero when dry and calm', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24);
		expect(discomfort(windowStats(f, leave, 20)!, 'walk')).toBe(0);
	});

	it('has no cliff at the gust threshold', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			9: { windGust: 34 },
			13: { windGust: 36 }
		});
		const below = discomfort(windowStats(f, at('2026-10-23T08:00:00Z'), 20)!, 'bike');
		const above = discomfort(windowStats(f, at('2026-10-23T12:00:00Z'), 20)!, 'bike');
		expect(above - below).toBeLessThan(0.1);
	});

	it('grows with rain chance, amount and gusts', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			9: { precipProbability: 50, precipitation: 1 },
			13: { precipProbability: 90, precipitation: 3, windGust: 60 }
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
		// Rain sets in at 17:00. Only a trip that is over by 17:00 stays dry.
		expect(s.offsetMin).toBe(-60);
		expect(s.message).toBe('Leave 60 min earlier (16:30): rain chance 10% instead of 80%');
	});

	it('suggests leaving later once a gusty spell passes', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			8: { windGust: 50 },
			9: { windGust: 50 },
			10: { windGust: 15 }
		});
		const s = suggestDeparture(f, at('2026-10-23T08:00:00Z'), 15, 'bike', opts)!;
		expect(s.offsetMin).toBe(60);
		expect(s.message).toBe('Leave 60 min later (09:00): gusts 15 km/h instead of 50 km/h');
	});

	it('prefers the smallest shift among equally good options', () => {
		// Rain from 11:00 to 12:00. Leaving at 10:30 and at 12:00 both stay dry.
		const f = makeForecast('2026-10-23T00:00:00Z', 24, { 12: { precipProbability: 90 } });
		const s = suggestDeparture(f, at('2026-10-23T11:30:00Z'), 20, 'walk', opts)!;
		expect(s.offsetMin).toBe(30);
	});

	it('ignores a gust dip just below the threshold (found in the London fixture)', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			8: { windGust: 34, precipProbability: 99 },
			9: { windGust: 36, precipProbability: 100 },
			10: { windGust: 36, precipProbability: 100 }
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
		const now = at('2026-10-23T17:00:00Z');
		expect(suggestDeparture(f, leave, 20, 'walk', { ...opts, now })).toBeNull();
		expect(suggestDeparture(f, leave, 20, 'walk', opts)?.offsetMin).toBe(-60);
	});

	it('uses mode thresholds: a shower that matters on a bike may not in a car', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			9: { precipProbability: 45, precipitation: 0.6 }
		});
		const start = at('2026-10-23T08:00:00Z');
		expect(suggestDeparture(f, start, 15, 'bike', opts)?.offsetMin).toBe(-15);
		expect(suggestDeparture(f, start, 15, 'car', opts)).toBeNull();
	});

	it('returns null when alternatives fall outside the forecast', () => {
		const short = makeForecast('2026-10-23T00:00:00Z', 2, { 1: { precipProbability: 90 } });
		expect(suggestDeparture(short, at('2026-10-23T00:00:00Z'), 10, 'walk', opts)).toBeNull();
		const longer = makeForecast('2026-10-23T00:00:00Z', 3, { 1: { precipProbability: 90 } });
		expect(suggestDeparture(longer, at('2026-10-23T00:00:00Z'), 10, 'walk', opts)?.offsetMin).toBe(
			60
		);
	});

	it('words imperial gusts in mph', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			8: { windGust: 20 },
			9: { windGust: 60 }
		});
		const s = suggestDeparture(f, at('2026-10-23T08:00:00Z'), 15, 'walk', {
			...opts,
			units: 'imperial'
		})!;
		expect(s.message).toBe('Leave 15 min earlier (07:45): gusts 12 mph instead of 37 mph');
	});
});

describe('suggestion wording', () => {
	it('mentions lighter rain when the chance stays high but the amount drops', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, {
			10: { precipProbability: 100, precipitation: 0.2 },
			11: { precipProbability: 100, precipitation: 2.5 },
			12: { precipProbability: 100, precipitation: 2.5 },
			13: { precipProbability: 100, precipitation: 2.5 }
		});
		const s = suggestDeparture(f, at('2026-10-23T10:15:00Z'), 30, 'walk', opts)!;
		expect(s.message).toBe('Leave 45 min earlier (09:30): lighter rain (0.2 mm instead of 2.5 mm)');
	});
});

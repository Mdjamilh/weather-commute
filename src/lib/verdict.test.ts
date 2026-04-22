import { describe, expect, it } from 'vitest';
import { at, makeForecast } from './testing';
import type { HourSample, Mode } from './types';
import { MODES } from './types';
import { RULES, verdictFor } from './verdict';
import { windowStats } from './window';

const opts = { units: 'metric' as const, timeZone: 'UTC' };

/** Stats for a 08:15 trip of 30 minutes where both touched hours share `hour`. */
function trip(hour: Partial<HourSample>, next: Partial<HourSample> = hour) {
	const f = makeForecast('2026-10-23T00:00:00Z', 24, { 8: hour, 9: next });
	return windowStats(f, at('2026-10-23T08:15:00Z'), 30)!;
}

describe('verdictFor: good conditions', () => {
	it.each(MODES)('gives a good verdict for calm, dry weather (%s)', (mode) => {
		const v = verdictFor(trip({ temperature: 14 }), mode, opts);
		expect(v.level).toBe('good');
		expect(v.headline).toBe('Good to go: 14°C and dry around 08:15');
		expect(v.reasons).toEqual([]);
	});

	it('says "probably dry" for a low but non-zero chance', () => {
		const v = verdictFor(trip({ precipProbability: 20 }), 'car', opts);
		expect(v.headline).toContain('probably dry');
	});
});

describe('verdictFor: rain', () => {
	it('matches the example from the brief', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, { 17: { precipProbability: 70 } });
		const stats = windowStats(f, at('2026-10-23T17:30:00Z'), 20)!;
		expect(verdictFor(stats, 'walk', opts).headline).toBe(
			'Bring an umbrella: 70% chance of rain around 17:30'
		);
	});

	it('names the wettest hour, not the departure hour', () => {
		const v = verdictFor(trip({ precipProbability: 20 }, { precipProbability: 70 }), 'walk', opts);
		expect(v.headline).toBe('Bring an umbrella: 70% chance of rain around 09:00');
	});

	it('is stricter for bikes than for cars', () => {
		const stats = trip({ precipProbability: 30, precipitation: 0.2 });
		expect(verdictFor(stats, 'bike', opts).headline).toBe(
			'Pack rain gear: 30% chance of rain around 08:15'
		);
		expect(verdictFor(stats, 'car', opts).level).toBe('good');
	});

	it('words the rain advice for each mode', () => {
		const stats = trip({ precipProbability: 80, precipitation: 0.5 });
		expect(verdictFor(stats, 'transit', opts).headline).toMatch(/^Bring an umbrella for the walk/);
		expect(verdictFor(stats, 'car', opts).headline).toMatch(/^Wet roads, allow extra time/);
	});

	it('escalates heavy rain to bad and suggests another way for bikes', () => {
		const stats = trip({ precipProbability: 90, precipitation: 2 });
		const bike = verdictFor(stats, 'bike', opts);
		expect(bike.level).toBe('bad');
		expect(bike.headline).toBe(
			'Heavy rain: 2.0 mm in an hour, 90% chance of rain around 08:15. Consider another way in'
		);
		// 2 mm/h is a nuisance, not heavy, on foot.
		expect(verdictFor(stats, 'walk', opts).level).toBe('caution');
	});

	it('formats amounts in imperial units', () => {
		const stats = trip({ precipProbability: 90, precipitation: 8 });
		expect(verdictFor(stats, 'walk', { ...opts, units: 'imperial' }).headline).toContain(
			'0.31 in in an hour'
		);
	});
});

describe('verdictFor: wind', () => {
	it('flags gusts that bother a cyclist but not a driver', () => {
		const stats = trip({ windGust: 40 });
		expect(verdictFor(stats, 'bike', opts).headline).toBe(
			'Hard riding: up to 40 km/h around 08:15'
		);
		expect(verdictFor(stats, 'car', opts).level).toBe('good');
	});

	it('marks severe gusts as bad', () => {
		const v = verdictFor(trip({ windGust: 80 }), 'walk', opts);
		expect(v.level).toBe('bad');
		expect(v.headline).toBe('Dangerous gusts up to 80 km/h around 08:15');
	});

	it('converts gusts to mph', () => {
		const v = verdictFor(trip({ windGust: 56 }), 'walk', { ...opts, units: 'imperial' });
		expect(v.headline).toBe('Gusty: up to 35 mph around 08:15');
	});
});

describe('verdictFor: temperature, ice, UV and storms', () => {
	it('warns about cold using feels-like', () => {
		const v = verdictFor(trip({ temperature: 4, feelsLike: -1 }), 'walk', opts);
		expect(v.headline).toBe('Wrap up: feels like -1°C');
		expect(verdictFor(trip({ temperature: 4, feelsLike: -1 }), 'car', opts).level).toBe('good');
	});

	it('flags ice when it is near freezing and wet', () => {
		const stats = trip({
			temperature: 0,
			feelsLike: -4,
			precipProbability: 60,
			precipitation: 0.3
		});
		const car = verdictFor(stats, 'car', opts);
		expect(car.level).toBe('bad');
		expect(car.headline).toBe('Ice risk: 0°C with precipitation around 08:15');
		expect(verdictFor(stats, 'walk', opts).level).toBe('caution');
	});

	it('does not flag ice when it is cold but dry', () => {
		const v = verdictFor(trip({ temperature: -3, feelsLike: -3 }), 'car', opts);
		expect(v.reasons.map((r) => r.kind)).not.toContain('ice');
	});

	it('reports snow instead of rain', () => {
		const v = verdictFor(
			trip({ weatherCode: 73, temperature: -1, feelsLike: -5, precipProbability: 80 }),
			'transit',
			opts
		);
		expect(v.reasons.map((r) => r.kind)).toEqual(['ice', 'snow', 'cold']);
	});

	it('handles heat differently for cars', () => {
		expect(verdictFor(trip({ feelsLike: 36 }), 'car', opts).headline).toBe(
			'Hot car: feels like 36°C, air it out first'
		);
		expect(verdictFor(trip({ feelsLike: 31 }), 'walk', opts).headline).toBe(
			'Heat: feels like 31°C, take water'
		);
	});

	it('mentions UV for walkers but not drivers', () => {
		expect(verdictFor(trip({ uvIndex: 7.4 }), 'walk', opts).headline).toBe('Sunscreen: UV index 7');
		expect(verdictFor(trip({ uvIndex: 7.4 }), 'car', opts).level).toBe('good');
	});

	it('treats thunderstorms as bad when exposed', () => {
		const stats = trip({ weatherCode: 95 });
		expect(verdictFor(stats, 'bike', opts).level).toBe('bad');
		expect(verdictFor(stats, 'transit', opts)).toMatchObject({
			level: 'caution',
			headline: 'Thunderstorms forecast: expect delays'
		});
	});
});

describe('verdictFor: ordering', () => {
	it('puts bad reasons first, then follows the fixed order', () => {
		const v = verdictFor(
			trip({ precipProbability: 50, precipitation: 0.5, windGust: 60, feelsLike: 1 }),
			'bike',
			opts
		);
		expect(v.reasons.map((r) => [r.kind, r.level])).toEqual([
			['wind', 'bad'],
			['rain', 'caution'],
			['cold', 'caution']
		]);
		expect(v.level).toBe('bad');
	});

	it('reports clock times in the location zone', () => {
		const f = makeForecast('2026-10-23T00:00:00Z', 24, { 7: { precipProbability: 70 } });
		// 07:15 UTC is 08:15 in London (BST) on 23 Oct.
		const stats = windowStats(f, at('2026-10-23T07:15:00Z'), 20)!;
		expect(verdictFor(stats, 'walk', { units: 'metric', timeZone: 'Europe/London' }).headline).toBe(
			'Bring an umbrella: 70% chance of rain around 08:15'
		);
	});
});

describe('RULES', () => {
	it('makes bikes at least as sensitive to rain and wind as any other mode', () => {
		const others: Mode[] = ['walk', 'transit', 'car'];
		for (const m of others) {
			expect(RULES.bike.rainChance).toBeLessThanOrEqual(RULES[m].rainChance);
			expect(RULES.bike.heavyRain).toBeLessThanOrEqual(RULES[m].heavyRain);
			expect(RULES.bike.gust).toBeLessThanOrEqual(RULES[m].gust);
		}
	});

	it('keeps severe gusts above the nuisance threshold', () => {
		for (const m of MODES) expect(RULES[m].severeGust).toBeGreaterThan(RULES[m].gust);
	});
});

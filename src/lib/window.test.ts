import { describe, expect, it } from 'vitest';
import { at, makeForecast } from './testing';
import { samplesFor, windowStats } from './window';

const day = makeForecast('2026-10-23T00:00:00Z', 24, {
	8: { precipProbability: 40, precipitation: 0.4, windGust: 30, temperature: 9, feelsLike: 6 },
	9: { precipProbability: 70, precipitation: 1.8, windGust: 25, temperature: 11, feelsLike: 9 },
	17: { windGust: 55, uvIndex: 0 },
	18: { windGust: 55 }
});

describe('samplesFor', () => {
	it('uses the nearest hours either side of a quarter-past departure', () => {
		const rows = samplesFor(day, at('2026-10-23T08:15:00Z'), 30);
		expect(rows.map((r) => new Date(r.time * 1000).getUTCHours())).toEqual([8, 9]);
	});

	it('uses a single hour for a short trip on the hour', () => {
		const rows = samplesFor(day, at('2026-10-23T08:00:00Z'), 20);
		expect(rows).toHaveLength(1);
	});

	it('spans several hours for a long trip', () => {
		expect(samplesFor(day, at('2026-10-23T07:00:00Z'), 120)).toHaveLength(3);
	});
});

describe('windowStats', () => {
	it('aggregates worst-case values over the trip', () => {
		const s = windowStats(day, at('2026-10-23T08:15:00Z'), 30)!;
		expect(s.precipProbMax).toBe(70);
		expect(s.precipMax).toBe(1.8);
		expect(s.gustMax).toBe(30);
		expect(s.tempMin).toBe(9);
		expect(s.feelsMin).toBe(6);
		expect(s.wettestTime).toBe(at('2026-10-23T09:00:00Z'));
		expect(s.windiestTime).toBe(at('2026-10-23T08:00:00Z'));
	});

	it('reports the earliest hour when two are equally windy', () => {
		const s = windowStats(day, at('2026-10-23T17:15:00Z'), 45)!;
		expect(s.windiestTime).toBe(at('2026-10-23T17:00:00Z'));
	});

	it('returns null outside the forecast range', () => {
		expect(windowStats(day, at('2026-10-25T08:00:00Z'), 30)).toBeNull();
	});

	it('returns null when the trip runs off the end of the data', () => {
		expect(windowStats(day, at('2026-10-23T23:00:00Z'), 90)).toBeNull();
		expect(windowStats(day, at('2026-10-23T23:00:00Z'), 20)).not.toBeNull();
	});

	it('lists distinct weather codes', () => {
		const stormy = makeForecast('2026-10-23T00:00:00Z', 3, {
			0: { weatherCode: 61 },
			1: { weatherCode: 61 }
		});
		expect(windowStats(stormy, at('2026-10-23T00:10:00Z'), 90)!.weatherCodes).toEqual([61, 1]);
	});
});

import { describe, expect, it } from 'vitest';
import { at, makeForecast } from './testing';
import type { HourSample } from './types';
import { rowsFor, windowStats } from './window';

const hoursOf = (rows: HourSample[]) => rows.map((r) => new Date(r.time * 1000).getUTCHours());

const day = makeForecast('2026-10-23T00:00:00Z', 24, {
	8: { temperature: 9, feelsLike: 6, windGust: 20 },
	9: { precipProbability: 70, precipitation: 1.8, windGust: 30, temperature: 11, feelsLike: 9 },
	17: { windGust: 55 },
	18: { windGust: 55, precipProbability: 40 }
});

describe('rowsFor', () => {
	it('reads rain from the row after a quarter-past departure', () => {
		const { periodRows, instantRows } = rowsFor(day, at('2026-10-23T08:15:00Z'), 30);
		expect(hoursOf(periodRows)).toEqual([9]);
		expect(hoursOf(instantRows)).toEqual([8, 9]);
	});

	it('does not count the hour that ended as you left', () => {
		const { periodRows } = rowsFor(day, at('2026-10-23T08:00:00Z'), 20);
		expect(hoursOf(periodRows)).toEqual([9]);
	});

	it('spans several rows for a long trip', () => {
		const { periodRows, instantRows } = rowsFor(day, at('2026-10-23T07:00:00Z'), 120);
		expect(hoursOf(periodRows)).toEqual([8, 9]);
		expect(hoursOf(instantRows)).toEqual([7, 8, 9]);
	});

	it('includes the next hour when a trip crosses the hour', () => {
		const { periodRows } = rowsFor(day, at('2026-10-23T17:45:00Z'), 30);
		expect(hoursOf(periodRows)).toEqual([18, 19]);
	});

	it('matches rows by timestamp in half-hour offset zones', () => {
		// Kolkata hourly rows fall on :30 in UTC.
		const india = makeForecast('2026-10-23T00:30:00Z', 24, {}, 'Asia/Kolkata');
		const { periodRows, instantRows } = rowsFor(india, at('2026-10-23T02:45:00Z'), 30);
		const hhmm = (rows: HourSample[]) =>
			rows.map((r) => new Date(r.time * 1000).toISOString().slice(11, 16));
		expect(hhmm(periodRows)).toEqual(['03:30']);
		expect(hhmm(instantRows)).toEqual(['02:30', '03:30']);
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
		expect(s.tempMax).toBe(11);
	});

	it('clips the wettest hour to the departure time', () => {
		const s = windowStats(day, at('2026-10-23T08:15:00Z'), 30)!;
		expect(s.wettestTime).toBe(at('2026-10-23T08:15:00Z'));
	});

	it('reports when a later wet hour begins on a long trip', () => {
		const s = windowStats(day, at('2026-10-23T07:00:00Z'), 120)!;
		expect(s.wettestTime).toBe(at('2026-10-23T08:00:00Z'));
	});

	it('reports the earliest hour when two are equally windy', () => {
		const s = windowStats(day, at('2026-10-23T16:15:00Z'), 105)!;
		expect(s.windiestTime).toBe(at('2026-10-23T16:15:00Z'));
		expect(s.precipProbMax).toBe(40);
		expect(s.wettestTime).toBe(at('2026-10-23T17:00:00Z'));
	});

	it('returns null outside the forecast range', () => {
		expect(windowStats(day, at('2026-10-25T08:00:00Z'), 30)).toBeNull();
		expect(windowStats(day, at('2026-10-22T23:50:00Z'), 20)).toBeNull();
	});

	it('returns null when the trip runs off the end of the data', () => {
		expect(windowStats(day, at('2026-10-23T23:00:00Z'), 20)).toBeNull();
		expect(windowStats(day, at('2026-10-23T22:00:00Z'), 60)).not.toBeNull();
	});

	it('lists distinct weather codes from the period rows', () => {
		const stormy = makeForecast('2026-10-23T00:00:00Z', 4, {
			1: { weatherCode: 61 },
			2: { weatherCode: 61 }
		});
		expect(windowStats(stormy, at('2026-10-23T00:10:00Z'), 140)!.weatherCodes).toEqual([61, 1]);
	});
});

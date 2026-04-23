import { describe, expect, it } from 'vitest';
import londonJson from './__fixtures__/forecast-london-dst-end.json';
import newYorkJson from './__fixtures__/forecast-new-york-dst-end.json';
import sydneyJson from './__fixtures__/forecast-sydney-dst-start.json';
import { parseForecast } from './forecast';
import { planWeek } from './plan';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { at, makeForecast } from './testing';
import { formatClock } from './time';
import { MODES } from './types';

const london = parseForecast(londonJson);
const newYork = parseForecast(newYorkJson);
const sydney = parseForecast(sydneyJson);
const settings: Settings = { ...DEFAULT_SETTINGS, mode: 'bike' };

describe('planWeek calendar', () => {
	it('labels today, tomorrow and then weekdays in the home zone', () => {
		const days = planWeek({ settings, home: london, now: at('2026-10-23T05:00:00Z') });
		expect(days.map((d) => d.label)).toEqual([
			'Today',
			'Tomorrow',
			'Sun 25 Oct',
			'Mon 26 Oct',
			'Tue 27 Oct',
			'Wed 28 Oct',
			'Thu 29 Oct'
		]);
		expect(days[0]!.isToday).toBe(true);
	});

	it('uses the home date, not the UTC date, late in the evening', () => {
		// 23:30 UTC on 22 Oct is already 23 Oct in Sydney... use a UTC-behind zone too.
		const days = planWeek({
			settings,
			home: newYork,
			now: at('2026-10-30T02:00:00Z') // 22:00 on 29 Oct in New York
		});
		expect(days[0]!.date).toBe('2026-10-29');
	});
});

describe('planWeek across DST with recorded forecasts', () => {
	it('keeps 08:15 and 17:30 local in London when clocks go back on 25 Oct', () => {
		const days = planWeek({ settings, home: london, now: at('2026-10-23T05:00:00Z') });
		const byDate = Object.fromEntries(days.map((d) => [d.date, d.trips]));
		expect(byDate['2026-10-24']![0]!.start).toBe(at('2026-10-24T07:15:00Z'));
		expect(byDate['2026-10-25']![0]!.start).toBe(at('2026-10-25T08:15:00Z'));
		expect(byDate['2026-10-25']![1]!.start).toBe(at('2026-10-25T17:30:00Z'));
		for (const d of days) {
			for (const t of d.trips) expect(formatClock(t.start, t.timeZone)).toBe(t.departure);
		}
	});

	it('uses the right hourly rows after the change in New York (1 Nov)', () => {
		const days = planWeek({ settings, home: newYork, now: at('2026-10-29T10:00:00Z') });
		const sunday = days.find((d) => d.date === '2026-11-01')!;
		const out = sunday.trips[0]!;
		// 08:15 EST is 13:15 UTC, so the 13:00 and 14:00 UTC rows are used.
		expect(out.stats!.instantRows.map((s) => new Date(s.time * 1000).getUTCHours())).toEqual([
			13, 14
		]);
	});

	it('handles a 23-hour day in Sydney (4 Oct) with a departure inside the gap', () => {
		const early = { ...settings, outbound: '02:30' };
		const days = planWeek({ settings: early, home: sydney, now: at('2026-10-01T14:00:00Z') });
		const sunday = days.find((d) => d.date === '2026-10-04')!;
		expect(formatClock(sunday.trips[0]!.start, 'Australia/Sydney')).toBe('03:30');
		expect(sunday.trips[0]!.verdict).not.toBeNull();
	});

	it('produces a verdict for every trip in range, for every mode', () => {
		for (const mode of MODES) {
			const days = planWeek({
				settings: { ...settings, mode },
				home: london,
				now: at('2026-10-23T05:00:00Z')
			});
			const trips = days.flatMap((d) => d.trips);
			expect(trips.every((t) => t.verdict?.headline)).toBe(true);
		}
	});

	it('matches the recorded London week (snapshot of headlines)', () => {
		const days = planWeek({ settings, home: london, now: at('2026-10-23T05:00:00Z') });
		const summary = days.map((d) => ({
			date: d.date,
			trips: d.trips.map((t) => ({
				at: t.departure,
				level: t.verdict?.level,
				headline: t.verdict?.headline,
				suggestion: t.suggestion?.message ?? null
			}))
		}));
		expect(summary).toMatchSnapshot();
	});
});

describe('planWeek behaviour', () => {
	const f = makeForecast('2026-10-23T00:00:00Z', 72, { 17: { precipProbability: 90 } });

	it('marks finished trips as passed and does not suggest for them', () => {
		const days = planWeek({
			settings: { ...settings, mode: 'walk' },
			home: f,
			now: at('2026-10-23T12:00:00Z')
		});
		const [out, back] = days[0]!.trips;
		expect(out!.passed).toBe(true);
		expect(out!.suggestion).toBeNull();
		expect(back!.passed).toBe(false);
	});

	it('leaves trips beyond the forecast without a verdict', () => {
		const days = planWeek({ settings, home: f, now: at('2026-10-23T00:00:00Z') });
		expect(days[2]!.trips[0]!.verdict).not.toBeNull();
		expect(days[5]!.trips[0]!.verdict).toBeNull();
	});

	it('reads the return time in the work zone', () => {
		const home = makeForecast('2026-10-23T00:00:00Z', 72, {}, 'Europe/London');
		const work = makeForecast('2026-10-23T00:00:00Z', 72, {}, 'Europe/Paris');
		const days = planWeek({ settings, home, work, now: at('2026-10-23T00:00:00Z') });
		// 17:30 in Paris (CEST, +2) is 15:30 UTC.
		expect(days[0]!.trips[1]!.start).toBe(at('2026-10-23T15:30:00Z'));
		expect(days[0]!.trips[0]!.start).toBe(at('2026-10-23T07:15:00Z'));
	});
});

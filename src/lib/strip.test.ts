import { describe, expect, it } from 'vitest';
import londonJson from './__fixtures__/forecast-london-dst-end.json';
import { parseForecast } from './forecast';
import { hoursForDay, stripGeometry } from './strip';
import { at, makeForecast } from './testing';

const base = { width: 360, height: 100, timeZone: 'UTC', units: 'metric' as const };

describe('stripGeometry', () => {
	const f = makeForecast('2026-10-23T06:00:00Z', 6, {
		0: { precipProbability: 0, temperature: 8 },
		1: { temperature: 9 },
		2: { precipProbability: 50, temperature: 12 },
		3: { temperature: 11 },
		4: { temperature: 11 },
		5: { precipProbability: 100, temperature: 10 }
	});

	it('scales bars by rain chance within the plot', () => {
		const g = stripGeometry(f.hours, base);
		expect(g.bars).toHaveLength(6);
		expect(g.bars[0]!.height).toBe(0);
		expect(g.bars[2]!.height).toBeCloseTo(32);
		expect(g.bars[5]!.height).toBeCloseTo(64);
		expect(g.bars[5]!.y).toBeCloseTo(18);
		expect(g.halfLine).toBe(50);
	});

	it('keeps every bar inside the width', () => {
		const g = stripGeometry(f.hours, base);
		for (const b of g.bars) {
			expect(b.x).toBeGreaterThanOrEqual(0);
			expect(b.x + b.width).toBeLessThanOrEqual(360);
		}
	});

	it('draws the temperature line with the warmest hour highest', () => {
		const g = stripGeometry(f.hours, base);
		expect(g.tempPath.startsWith('M30.0,')).toBe(true);
		expect(g.tempPath.split(' ')).toHaveLength(6);
		expect(g.tempLabels.map((l) => l.text)).toEqual(['12°', '8°']);
	});

	it('labels in Fahrenheit for imperial units', () => {
		const g = stripGeometry(f.hours, { ...base, units: 'imperial' });
		expect(g.tempLabels.map((l) => l.text)).toEqual(['54°', '46°']);
	});

	it('ticks every three local hours', () => {
		const g = stripGeometry(f.hours, { ...base, timeZone: 'Europe/London' });
		// 06:00 UTC is 07:00 BST, so ticks fall on 09 and 12 local.
		expect(g.ticks.map((t) => t.label)).toEqual(['09', '12']);
	});

	it('places departure markers between slots and drops ones off the strip', () => {
		const g = stripGeometry(f.hours, {
			...base,
			markers: [
				{ time: at('2026-10-23T07:30:00Z'), label: 'Out' },
				{ time: at('2026-10-23T20:00:00Z'), label: 'Back' }
			]
		});
		expect(g.markers).toEqual([{ x: 120, label: 'Out' }]);
	});

	it('moves a high temperature label out of the way of a marker caption', () => {
		const g = stripGeometry(f.hours, {
			...base,
			markers: [{ time: at('2026-10-23T08:00:00Z'), label: 'Out' }]
		});
		const warmest = g.tempLabels.find((l) => l.text === '12°')!;
		expect(warmest.y).toBeCloseTo(31);
		const free = stripGeometry(f.hours, base).tempLabels.find((l) => l.text === '12°')!;
		expect(free.y).toBeCloseTo(13);
	});

	it('copes with empty and single-hour input', () => {
		expect(stripGeometry([], base).tempPath).toBe('');
		const one = stripGeometry(f.hours.slice(0, 1), base);
		expect(one.tempPath).toBe('');
		expect(one.tempLabels).toHaveLength(1);
	});
});

describe('hoursForDay', () => {
	it('selects local hours, including both 01:00 rows when clocks go back', () => {
		const london = parseForecast(londonJson);
		const night = hoursForDay(london.hours, '2026-10-25', 'Europe/London', 0, 2);
		expect(night).toHaveLength(4);
		const day = hoursForDay(london.hours, '2026-10-25', 'Europe/London');
		expect(day).toHaveLength(18);
	});
});

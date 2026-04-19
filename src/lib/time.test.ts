import { describe, expect, it } from 'vitest';
import {
	addDays,
	formatClock,
	formatDay,
	localParts,
	offsetAt,
	parseClock,
	shiftClock,
	zonedTimeToUnix
} from './time';

const utc = (iso: string) => Date.parse(iso) / 1000;

describe('parseClock', () => {
	it('accepts 24-hour clocks', () => {
		expect(parseClock('08:15')).toEqual({ hour: 8, minute: 15 });
		expect(parseClock('7:05')).toEqual({ hour: 7, minute: 5 });
		expect(parseClock(' 23:59 ')).toEqual({ hour: 23, minute: 59 });
	});

	it('rejects malformed input', () => {
		for (const bad of ['24:00', '12:60', '8', '', 'ab:cd', '08:15:00']) {
			expect(parseClock(bad), bad).toBeNull();
		}
	});
});

describe('localParts and offsetAt', () => {
	it('reads wall-clock time in the target zone, not the machine zone', () => {
		expect(localParts(utc('2026-10-23T07:15:00Z'), 'Europe/London')).toEqual({
			date: '2026-10-23',
			hour: 8,
			minute: 15
		});
		expect(localParts(utc('2026-10-23T23:30:00Z'), 'Asia/Tokyo')).toEqual({
			date: '2026-10-24',
			hour: 8,
			minute: 30
		});
	});

	it('reports offsets on both sides of a transition', () => {
		expect(offsetAt(utc('2026-10-25T00:30:00Z'), 'Europe/London')).toBe(3600);
		expect(offsetAt(utc('2026-10-25T01:30:00Z'), 'Europe/London')).toBe(0);
		expect(offsetAt(utc('2026-01-01T00:00:00Z'), 'Asia/Kathmandu')).toBe(5 * 3600 + 45 * 60);
	});
});

describe('zonedTimeToUnix', () => {
	it('handles an ordinary day', () => {
		expect(zonedTimeToUnix('2026-10-24', '08:15', 'Europe/London')).toBe(
			utc('2026-10-24T07:15:00Z')
		);
		expect(zonedTimeToUnix('2026-10-23', '08:15', 'Asia/Kolkata')).toBe(
			utc('2026-10-23T02:45:00Z')
		);
	});

	it('uses the new offset after clocks go back (London, 25 Oct 2026)', () => {
		expect(zonedTimeToUnix('2026-10-25', '08:15', 'Europe/London')).toBe(
			utc('2026-10-25T08:15:00Z')
		);
	});

	it('picks the first occurrence of a repeated hour', () => {
		expect(zonedTimeToUnix('2026-10-25', '01:30', 'Europe/London')).toBe(
			utc('2026-10-25T00:30:00Z')
		);
		expect(zonedTimeToUnix('2026-11-01', '01:30', 'America/New_York')).toBe(
			utc('2026-11-01T05:30:00Z')
		);
	});

	it('moves a skipped time forward by the gap (Sydney, 4 Oct 2026)', () => {
		const t = zonedTimeToUnix('2026-10-04', '02:30', 'Australia/Sydney');
		expect(t).toBe(utc('2026-10-03T16:30:00Z'));
		expect(localParts(t, 'Australia/Sydney')).toEqual({ date: '2026-10-04', hour: 3, minute: 30 });
	});

	it('moves a skipped time forward in the northern spring too (New York, 8 Mar 2026)', () => {
		expect(
			formatClock(zonedTimeToUnix('2026-03-08', '02:30', 'America/New_York'), 'America/New_York')
		).toBe('03:30');
	});

	it('keeps the same wall clock across a transition', () => {
		const before = zonedTimeToUnix('2026-10-31', '17:30', 'America/New_York');
		const after = zonedTimeToUnix('2026-11-01', '17:30', 'America/New_York');
		expect(after - before).toBe(25 * 3600);
		expect(formatClock(after, 'America/New_York')).toBe('17:30');
	});

	it('rejects invalid input', () => {
		expect(() => zonedTimeToUnix('2026-13-01', '08:00', 'UTC')).toThrow(RangeError);
		expect(() => zonedTimeToUnix('2026-10-01', '8am', 'UTC')).toThrow(RangeError);
	});
});

describe('date helpers', () => {
	it('adds days across month and year ends', () => {
		expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	it('formats day labels', () => {
		expect(formatDay('2026-10-25')).toBe('Sun 25 Oct');
	});

	it('shifts clocks with wrap-around', () => {
		expect(shiftClock('08:15', -30)).toBe('07:45');
		expect(shiftClock('23:30', 45)).toBe('00:15');
		expect(shiftClock('00:10', -20)).toBe('23:50');
	});
});

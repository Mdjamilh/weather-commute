import { describe, expect, it } from 'vitest';
import { cToF, formatPercent, formatPrecip, formatSpeed, formatTemp, kmhToMph } from './units';

describe('conversions', () => {
	it('converts temperature and speed', () => {
		expect(cToF(0)).toBe(32);
		expect(cToF(-40)).toBe(-40);
		expect(kmhToMph(100)).toBeCloseTo(62.137, 3);
	});
});

describe('formatters', () => {
	it('formats temperatures in both systems', () => {
		expect(formatTemp(12.4, 'metric')).toBe('12°C');
		expect(formatTemp(12.4, 'imperial')).toBe('54°F');
	});

	it('never prints negative zero', () => {
		expect(formatTemp(-0.3, 'metric')).toBe('0°C');
	});

	it('formats wind speed', () => {
		expect(formatSpeed(48, 'metric')).toBe('48 km/h');
		expect(formatSpeed(48, 'imperial')).toBe('30 mph');
	});

	it('formats precipitation including trace amounts', () => {
		expect(formatPrecip(0, 'metric')).toBe('0.0 mm');
		expect(formatPrecip(0.05, 'metric')).toBe('<0.1 mm');
		expect(formatPrecip(2.34, 'metric')).toBe('2.3 mm');
		expect(formatPrecip(0.1, 'imperial')).toBe('<0.01 in');
		expect(formatPrecip(12.7, 'imperial')).toBe('0.50 in');
	});

	it('formats percentages', () => {
		expect(formatPercent(69.6)).toBe('70%');
	});
});

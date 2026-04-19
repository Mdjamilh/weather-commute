import { describe, expect, it, vi } from 'vitest';
import london from './__fixtures__/forecast-london-dst-end.json';
import sydney from './__fixtures__/forecast-sydney-dst-start.json';
import { buildForecastUrl, fetchForecast, ForecastError, parseForecast } from './forecast';
import { localParts } from './time';

describe('buildForecastUrl', () => {
	it('asks for metric hourly data in the location time zone as unixtime', () => {
		const url = new URL(buildForecastUrl({ latitude: 51.50853, longitude: -0.12574 }));
		expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
		expect(url.searchParams.get('timezone')).toBe('auto');
		expect(url.searchParams.get('timeformat')).toBe('unixtime');
		expect(url.searchParams.get('forecast_days')).toBe('7');
		expect(url.searchParams.get('latitude')).toBe('51.5085');
		expect(url.searchParams.get('hourly')?.split(',')).toContain('wind_gusts_10m');
	});
});

describe('parseForecast with recorded responses', () => {
	it('turns columns into hourly rows', () => {
		const f = parseForecast(london);
		expect(f.timezone).toBe('Europe/London');
		expect(f.hours).toHaveLength(168);
		const first = f.hours[0]!;
		expect(first.time).toBe(london.hourly.time[0]);
		expect(first.temperature).toBe(london.hourly.temperature_2m[0]);
		expect(first.windGust).toBe(london.hourly.wind_gusts_10m[0]);
	});

	it('keeps timestamps strictly hourly through the night clocks go back', () => {
		const f = parseForecast(london);
		for (let i = 1; i < f.hours.length; i++) {
			expect(f.hours[i]!.time - f.hours[i - 1]!.time).toBe(3600);
		}
		// 25 Oct 2026 has 25 local hours in London, with 01:00 appearing twice.
		const onTheDay = f.hours.filter((h) => localParts(h.time, f.timezone).date === '2026-10-25');
		expect(onTheDay).toHaveLength(25);
		const ones = onTheDay.filter((h) => localParts(h.time, f.timezone).hour === 1);
		expect(ones).toHaveLength(2);
	});

	it('has only 23 local hours on the night Sydney clocks go forward', () => {
		const f = parseForecast(sydney);
		const onTheDay = f.hours.filter((h) => localParts(h.time, f.timezone).date === '2026-10-04');
		expect(onTheDay).toHaveLength(23);
		expect(onTheDay.some((h) => localParts(h.time, f.timezone).hour === 2)).toBe(false);
	});

	it('shows why utc_offset_seconds alone is not enough', () => {
		// The response carries a single offset (BST, +1h) that is wrong after 25 Oct.
		expect(london.utc_offset_seconds).toBe(3600);
		const f = parseForecast(london);
		const lastHour = f.hours.at(-1)!;
		const naive = new Date((lastHour.time + london.utc_offset_seconds) * 1000).getUTCHours();
		expect(localParts(lastHour.time, f.timezone).hour).toBe((naive + 23) % 24);
	});
});

describe('parseForecast validation', () => {
	const base = () => structuredClone(london) as unknown as Record<string, unknown>;

	it('rejects API error payloads with the given reason', () => {
		expect(() => parseForecast({ error: true, reason: 'Latitude must be in range' })).toThrow(
			'Latitude must be in range'
		);
	});

	it('rejects misaligned columns', () => {
		const bad = base();
		(bad.hourly as Record<string, unknown[]>).uv_index!.pop();
		expect(() => parseForecast(bad)).toThrow(/uv_index/);
	});

	it('rejects ISO timestamps', () => {
		const bad = base();
		(bad.hourly as Record<string, unknown[]>).time![0] = '2026-10-23T00:00';
		expect(() => parseForecast(bad)).toThrow(ForecastError);
	});

	it('drops hours without temperature and defaults other nulls', () => {
		const bad = base();
		const hourly = bad.hourly as Record<string, (number | null)[]>;
		hourly.temperature_2m![0] = null;
		hourly.precipitation_probability![1] = null;
		const f = parseForecast(bad);
		expect(f.hours).toHaveLength(167);
		expect(f.hours[0]!.precipProbability).toBe(0);
	});

	it('rejects non-objects', () => {
		expect(() => parseForecast(null)).toThrow(ForecastError);
		expect(() => parseForecast({ timezone: 'UTC' })).toThrow('Missing hourly data');
	});
});

describe('fetchForecast', () => {
	it('fetches and parses', async () => {
		const fake = vi.fn(async () => new Response(JSON.stringify(london), { status: 200 }));
		const f = await fetchForecast({ latitude: 51.5, longitude: -0.12 }, { fetch: fake });
		expect(f.hours).toHaveLength(168);
		expect(fake).toHaveBeenCalledOnce();
	});

	it('surfaces the API reason on HTTP errors', async () => {
		const fake = vi.fn(
			async () =>
				new Response(JSON.stringify({ error: true, reason: 'Invalid timezone' }), { status: 400 })
		);
		await expect(fetchForecast({ latitude: 0, longitude: 0 }, { fetch: fake })).rejects.toThrow(
			'Forecast request failed (400): Invalid timezone'
		);
	});

	it('handles non-JSON error bodies', async () => {
		const fake = vi.fn(async () => new Response('<html>bad gateway</html>', { status: 502 }));
		await expect(fetchForecast({ latitude: 0, longitude: 0 }, { fetch: fake })).rejects.toThrow(
			'(502)'
		);
	});
});

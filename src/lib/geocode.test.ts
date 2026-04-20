import { describe, expect, it, vi } from 'vitest';
import london from './__fixtures__/geocode-london.json';
import newYork from './__fixtures__/geocode-new-york.json';
import { buildGeocodeUrl, GeocodeError, parseGeocode, placeLabel, searchPlaces } from './geocode';

describe('buildGeocodeUrl', () => {
	it('trims and encodes the query', () => {
		const url = new URL(buildGeocodeUrl('  São Paulo '));
		expect(url.hostname).toBe('geocoding-api.open-meteo.com');
		expect(url.searchParams.get('name')).toBe('São Paulo');
		expect(url.searchParams.get('count')).toBe('6');
	});
});

describe('parseGeocode', () => {
	it('maps recorded results to places with time zones', () => {
		const places = parseGeocode(london);
		expect(places.length).toBeGreaterThan(1);
		expect(places[0]).toMatchObject({
			name: 'London',
			countryCode: 'GB',
			timezone: 'Europe/London'
		});
		// A second London (Ontario) shows why the label needs region and country.
		expect(places.some((p) => p.countryCode === 'CA')).toBe(true);
	});

	it('returns the New York entry with its zone', () => {
		const [first] = parseGeocode(newYork);
		expect(first?.timezone).toBe('America/New_York');
		expect(first?.latitude).toBeCloseTo(40.714, 2);
	});

	it('treats a missing results key as no matches', () => {
		expect(parseGeocode({ generationtime_ms: 0.4 })).toEqual([]);
	});

	it('skips entries without a time zone', () => {
		const places = parseGeocode({
			results: [
				{ id: 1, name: 'Nowhere', latitude: 0, longitude: 0 },
				{ id: 2, name: 'Somewhere', latitude: 1, longitude: 1, timezone: 'UTC' }
			]
		});
		expect(places.map((p) => p.name)).toEqual(['Somewhere']);
	});

	it('throws on API errors', () => {
		expect(() => parseGeocode({ error: true, reason: 'Parameter count must be <= 100' })).toThrow(
			GeocodeError
		);
		expect(() => parseGeocode('nope')).toThrow(GeocodeError);
	});
});

describe('placeLabel', () => {
	it('joins name, region and country without duplicates', () => {
		expect(
			placeLabel({
				id: 1,
				name: 'Singapore',
				admin1: undefined,
				country: 'Singapore',
				latitude: 1.3,
				longitude: 103.8,
				timezone: 'Asia/Singapore'
			})
		).toBe('Singapore');
		const [london1] = parseGeocode(london);
		expect(placeLabel(london1!)).toBe('London, England, United Kingdom');
	});
});

describe('searchPlaces', () => {
	it('does not call the API for very short queries', async () => {
		const fake = vi.fn();
		expect(await searchPlaces('a', { fetch: fake })).toEqual([]);
		expect(fake).not.toHaveBeenCalled();
	});

	it('returns parsed places', async () => {
		const fake = vi.fn(async () => new Response(JSON.stringify(london)));
		const places = await searchPlaces('London', { fetch: fake });
		expect(places[0]?.name).toBe('London');
	});

	it('throws on HTTP failure', async () => {
		const fake = vi.fn(async () => new Response('busy', { status: 503 }));
		await expect(searchPlaces('London', { fetch: fake })).rejects.toThrow(
			'City search failed (503)'
		);
	});
});

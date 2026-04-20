import type { Place } from './types';

export const GEOCODE_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';

export function buildGeocodeUrl(query: string, count = 6): string {
	const params = new URLSearchParams({
		name: query.trim(),
		count: String(count),
		language: 'en',
		format: 'json'
	});
	return `${GEOCODE_ENDPOINT}?${params}`;
}

export class GeocodeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GeocodeError';
	}
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/**
 * Parses a geocoding response. The API omits `results` entirely when nothing
 * matches, and some entries come without a time zone; those are useless to us
 * because every commute time is interpreted in the location's own zone.
 */
export function parseGeocode(json: unknown): Place[] {
	if (typeof json !== 'object' || json === null) {
		throw new GeocodeError('Geocoding response was not an object');
	}
	const body = json as Record<string, unknown>;
	if (body.error === true) throw new GeocodeError(String(body.reason ?? 'Geocoding failed'));
	if (!Array.isArray(body.results)) return [];
	const places: Place[] = [];
	for (const r of body.results as Record<string, unknown>[]) {
		const { id, name, latitude, longitude, timezone } = r;
		if (
			typeof id !== 'number' ||
			typeof name !== 'string' ||
			typeof latitude !== 'number' ||
			typeof longitude !== 'number' ||
			typeof timezone !== 'string'
		) {
			continue;
		}
		places.push({
			id,
			name,
			admin1: str(r.admin1),
			country: str(r.country),
			countryCode: str(r.country_code),
			latitude,
			longitude,
			timezone
		});
	}
	return places;
}

/** "Springfield, Illinois, United States" without repeating the name. */
export function placeLabel(place: Place): string {
	return [place.name, place.admin1, place.country]
		.filter((p, i, all): p is string => !!p && all.indexOf(p) === i)
		.join(', ');
}

export async function searchPlaces(
	query: string,
	options: { fetch?: typeof fetch; signal?: AbortSignal } = {}
): Promise<Place[]> {
	// The API needs at least two characters and returns nothing useful for one.
	if (query.trim().length < 2) return [];
	const doFetch = options.fetch ?? fetch;
	const res = await doFetch(buildGeocodeUrl(query), { signal: options.signal });
	if (!res.ok) throw new GeocodeError(`City search failed (${res.status})`);
	return parseGeocode(await res.json());
}

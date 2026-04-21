import type { Forecast, HourSample } from './types';

/** Calm, dry, mild defaults so each test only spells out what it cares about. */
export const CALM: Omit<HourSample, 'time'> = {
	temperature: 15,
	feelsLike: 15,
	precipProbability: 0,
	precipitation: 0,
	windGust: 10,
	uvIndex: 1,
	weatherCode: 1
};

/**
 * Builds a synthetic hourly forecast starting at `startIso` (a UTC instant on the hour).
 * `overrides` maps an hour index to the fields that differ from CALM.
 */
export function makeForecast(
	startIso: string,
	hours: number,
	overrides: Record<number, Partial<HourSample>> = {},
	timezone = 'UTC'
): Forecast {
	const start = Date.parse(startIso) / 1000;
	return {
		latitude: 0,
		longitude: 0,
		timezone,
		hours: Array.from({ length: hours }, (_, i) => ({
			...CALM,
			...overrides[i],
			time: start + i * 3600
		}))
	};
}

export const at = (iso: string) => Date.parse(iso) / 1000;

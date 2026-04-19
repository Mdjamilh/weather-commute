import type { Forecast, HourSample } from './types';

export const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

/** Hourly variables requested from Open-Meteo, in the order the API documents them. */
export const HOURLY_VARIABLES = [
	'temperature_2m',
	'apparent_temperature',
	'precipitation_probability',
	'precipitation',
	'wind_gusts_10m',
	'uv_index',
	'weather_code'
] as const;

type HourlyVariable = (typeof HOURLY_VARIABLES)[number];

export interface OpenMeteoForecast {
	latitude: number;
	longitude: number;
	timezone: string;
	utc_offset_seconds?: number;
	hourly: { time: number[] } & Record<HourlyVariable, (number | null)[]>;
}

/**
 * Builds the forecast URL. We always ask for metric values and Unix timestamps:
 * unit conversion happens at display time, and Unix seconds sidestep any parsing
 * of local ISO strings around daylight-saving changes.
 */
export function buildForecastUrl(
	coords: { latitude: number; longitude: number },
	days = 7
): string {
	const params = new URLSearchParams({
		latitude: coords.latitude.toFixed(4),
		longitude: coords.longitude.toFixed(4),
		hourly: HOURLY_VARIABLES.join(','),
		timezone: 'auto',
		timeformat: 'unixtime',
		wind_speed_unit: 'kmh',
		forecast_days: String(days)
	});
	return `${FORECAST_ENDPOINT}?${params}`;
}

export class ForecastError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ForecastError';
	}
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

/**
 * Validates and reshapes the column-oriented API response into rows.
 * Hours missing a temperature are dropped; other missing values default to 0
 * (Open-Meteo returns null past a model's horizon, mostly for probability).
 */
export function parseForecast(json: unknown): Forecast {
	if (!isRecord(json)) throw new ForecastError('Forecast response was not an object');
	if (json.error === true) {
		throw new ForecastError(String(json.reason ?? 'Open-Meteo returned an error'));
	}
	const { hourly, timezone, latitude, longitude } = json;
	if (typeof timezone !== 'string' || !timezone) throw new ForecastError('Missing timezone');
	if (!isRecord(hourly) || !Array.isArray(hourly.time)) {
		throw new ForecastError('Missing hourly data');
	}
	const time = hourly.time as unknown[];
	const col = (name: HourlyVariable): (number | null)[] => {
		const values = hourly[name];
		if (!Array.isArray(values) || values.length !== time.length) {
			throw new ForecastError(`Hourly column "${name}" is missing or misaligned`);
		}
		return values as (number | null)[];
	};
	const temp = col('temperature_2m');
	const feels = col('apparent_temperature');
	const prob = col('precipitation_probability');
	const precip = col('precipitation');
	const gust = col('wind_gusts_10m');
	const uv = col('uv_index');
	const code = col('weather_code');

	const hours: HourSample[] = [];
	for (let i = 0; i < time.length; i++) {
		const t = time[i];
		const temperature = temp[i];
		if (typeof t !== 'number') {
			throw new ForecastError('Expected unixtime timestamps; request timeformat=unixtime');
		}
		if (temperature == null) continue;
		hours.push({
			time: t,
			temperature,
			feelsLike: feels[i] ?? temperature,
			precipProbability: prob[i] ?? 0,
			precipitation: precip[i] ?? 0,
			windGust: gust[i] ?? 0,
			uvIndex: uv[i] ?? 0,
			weatherCode: code[i] ?? 0
		});
	}
	return {
		latitude: Number(latitude),
		longitude: Number(longitude),
		timezone,
		hours
	};
}

export async function fetchForecast(
	coords: { latitude: number; longitude: number },
	options: { fetch?: typeof fetch; signal?: AbortSignal } = {}
): Promise<Forecast> {
	const doFetch = options.fetch ?? fetch;
	const res = await doFetch(buildForecastUrl(coords), { signal: options.signal });
	let body: unknown;
	try {
		body = await res.json();
	} catch {
		throw new ForecastError(`Forecast request failed (${res.status})`);
	}
	if (!res.ok) {
		const reason = isRecord(body) && typeof body.reason === 'string' ? body.reason : res.statusText;
		throw new ForecastError(`Forecast request failed (${res.status}): ${reason}`);
	}
	return parseForecast(body);
}

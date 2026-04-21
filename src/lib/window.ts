import type { Forecast, HourSample } from './types';

/** Aggregated conditions over the hours that touch one trip. */
export interface WindowStats {
	start: number;
	end: number;
	samples: HourSample[];
	tempMin: number;
	tempMax: number;
	feelsMin: number;
	feelsMax: number;
	precipProbMax: number;
	/** Largest hourly precipitation amount, mm. */
	precipMax: number;
	gustMax: number;
	uvMax: number;
	/** Hour with the highest rain chance (earliest on ties). */
	wettestTime: number;
	/** Hour with the strongest gusts (earliest on ties). */
	windiestTime: number;
	weatherCodes: number[];
}

const HALF_HOUR = 1800;

/**
 * Picks the hourly samples relevant to a trip from `start` lasting `durationMin`.
 *
 * Each hourly value is treated as representative of the half hour either side of
 * its timestamp, so an 08:15 to 08:45 trip uses the 08:00 and 09:00 rows, and an
 * 08:00 to 08:20 trip uses only 08:00.
 */
export function samplesFor(forecast: Forecast, start: number, durationMin: number): HourSample[] {
	const end = start + Math.max(1, durationMin) * 60;
	return forecast.hours.filter((h) => h.time + HALF_HOUR > start && h.time - HALF_HOUR < end);
}

export function windowStats(
	forecast: Forecast,
	start: number,
	durationMin: number
): WindowStats | null {
	const samples = samplesFor(forecast, start, durationMin);
	const first = samples[0];
	if (!first) return null;
	// Missing hours at the edge of the forecast would understate the risk.
	const end = start + Math.max(1, durationMin) * 60;
	const last = samples[samples.length - 1]!;
	if (first.time - HALF_HOUR > start || last.time + HALF_HOUR < end) return null;

	let wettest = first;
	let windiest = first;
	for (const s of samples) {
		if (s.precipProbability > wettest.precipProbability) wettest = s;
		if (s.windGust > windiest.windGust) windiest = s;
	}
	const pick = (f: (s: HourSample) => number) => samples.map(f);
	return {
		start,
		end,
		samples,
		tempMin: Math.min(...pick((s) => s.temperature)),
		tempMax: Math.max(...pick((s) => s.temperature)),
		feelsMin: Math.min(...pick((s) => s.feelsLike)),
		feelsMax: Math.max(...pick((s) => s.feelsLike)),
		precipProbMax: wettest.precipProbability,
		precipMax: Math.max(...pick((s) => s.precipitation)),
		gustMax: windiest.windGust,
		uvMax: Math.max(...pick((s) => s.uvIndex)),
		wettestTime: wettest.time,
		windiestTime: windiest.time,
		weatherCodes: [...new Set(pick((s) => s.weatherCode))]
	};
}

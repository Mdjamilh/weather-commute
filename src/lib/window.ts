import type { Forecast, HourSample } from './types';

/** Aggregated conditions over the hours that touch one trip. */
export interface WindowStats {
	start: number;
	end: number;
	/** Rows whose preceding hour overlaps the trip (rain, gusts, weather code). */
	periodRows: HourSample[];
	/** Rows bracketing the trip (temperature, feels-like, UV). */
	instantRows: HourSample[];
	tempMin: number;
	tempMax: number;
	feelsMin: number;
	feelsMax: number;
	precipProbMax: number;
	/** Largest hourly precipitation amount, mm. */
	precipMax: number;
	gustMax: number;
	uvMax: number;
	/** When the wettest hour begins, clipped to the trip (earliest on ties). */
	wettestTime: number;
	/** When the windiest hour begins, clipped to the trip (earliest on ties). */
	windiestTime: number;
	weatherCodes: number[];
}

const HOUR = 3600;

/**
 * Open-Meteo mixes two kinds of hourly value, and a trip has to read each one
 * differently:
 *
 * - Precipitation, precipitation probability, wind gusts and the weather code
 *   describe the hour *preceding* the timestamp. The 09:00 row says whether it
 *   rains between 08:00 and 09:00. A trip uses every row whose preceding hour
 *   overlaps it, so 08:15 to 08:45 uses only the 09:00 row.
 * - Temperature, apparent temperature and UV are instantaneous. A trip uses the
 *   rows bracketing it: the last at or before departure through the first at or
 *   after arrival, so 08:15 to 08:45 uses 08:00 and 09:00.
 *
 * Rows are matched by their own timestamps, never by rounding to UTC hours, which
 * keeps zones with half-hour offsets (India, central Australia) correct.
 */
export function rowsFor(
	forecast: Forecast,
	start: number,
	durationMin: number
): { periodRows: HourSample[]; instantRows: HourSample[]; end: number } {
	const end = start + Math.max(1, durationMin) * 60;
	const { hours } = forecast;
	const periodRows = hours.filter((h) => h.time > start && h.time - HOUR < end);
	let from = -1;
	for (let i = 0; i < hours.length && hours[i]!.time <= start; i++) from = i;
	const to = hours.findIndex((h) => h.time >= end);
	const instantRows = from === -1 || to === -1 ? [] : hours.slice(from, Math.max(from, to) + 1);
	return { periodRows, instantRows, end };
}

export function windowStats(
	forecast: Forecast,
	start: number,
	durationMin: number
): WindowStats | null {
	const { periodRows, instantRows, end } = rowsFor(forecast, start, durationMin);
	// No bracketing rows, or no row covering the end, means the forecast does not cover the trip.
	const firstPeriod = periodRows[0];
	const lastPeriod = periodRows[periodRows.length - 1];
	if (!firstPeriod || !lastPeriod || instantRows.length === 0 || lastPeriod.time < end) {
		return null;
	}

	let wettest = firstPeriod;
	let windiest = firstPeriod;
	for (const s of periodRows) {
		if (s.precipProbability > wettest.precipProbability) wettest = s;
		if (s.windGust > windiest.windGust) windiest = s;
	}
	const clip = (rowTime: number) => Math.max(start, rowTime - HOUR);
	const period = (f: (s: HourSample) => number) => periodRows.map(f);
	const instant = (f: (s: HourSample) => number) => instantRows.map(f);
	return {
		start,
		end,
		periodRows,
		instantRows,
		tempMin: Math.min(...instant((s) => s.temperature)),
		tempMax: Math.max(...instant((s) => s.temperature)),
		feelsMin: Math.min(...instant((s) => s.feelsLike)),
		feelsMax: Math.max(...instant((s) => s.feelsLike)),
		precipProbMax: wettest.precipProbability,
		precipMax: Math.max(...period((s) => s.precipitation)),
		gustMax: windiest.windGust,
		uvMax: Math.max(...instant((s) => s.uvIndex)),
		wettestTime: clip(wettest.time),
		windiestTime: clip(windiest.time),
		weatherCodes: [...new Set(period((s) => s.weatherCode))]
	};
}

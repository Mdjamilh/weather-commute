import { formatClock } from './time';
import type { Forecast, Mode, Units } from './types';
import { formatPercent, formatSpeed } from './units';
import { RULES } from './verdict';
import { windowStats, type WindowStats } from './window';

/** Offsets tried around the usual departure, in minutes. Closest first. */
export const OFFSETS = [-15, 15, -30, 30, -45, 45, -60, 60] as const;

/** The best alternative must be at least this much better in absolute score... */
export const MIN_GAIN = 0.2;
/** ...and remove at least this share of the original discomfort. */
export const MIN_RATIO = 0.4;

/**
 * A single number for "how unpleasant is this trip", used only to compare
 * departure times. Only weather that changes hour to hour (rain and wind) counts,
 * so the planner never says "leave later, it is warmer".
 *
 * The score is continuous on purpose. An earlier version only counted wind above
 * the mode threshold, so gusts dropping from 36 to 34 km/h for a bike looked like a
 * big win and produced a pointless "leave 30 min earlier" suggestion.
 */
export function discomfort(stats: WindowStats, mode: Mode): number {
	const r = RULES[mode];
	const rain = (stats.precipProbMax / 100) * (1 + Math.min(stats.precipMax / r.heavyRain, 2));
	const wind = Math.max(0, stats.gustMax - 0.7 * r.gust) / r.gust;
	return rain + wind;
}

/** Whether the usual trip has rain or wind worth acting on for this mode. */
export function needsAlternative(stats: WindowStats, mode: Mode): boolean {
	const r = RULES[mode];
	return stats.precipProbMax >= r.rainChance || stats.gustMax >= r.gust;
}

export interface Suggestion {
	/** Minutes relative to the usual departure; negative means earlier. */
	offsetMin: number;
	start: number;
	stats: WindowStats;
	message: string;
}

export interface SuggestOptions {
	units: Units;
	timeZone: string;
	/** Unix seconds. Alternatives that start before this are skipped. */
	now?: number;
}

/**
 * Looks up to 60 minutes either side of the usual departure for a noticeably
 * drier or calmer trip. Returns null when the usual time is fine or nothing nearby
 * is clearly better. Ties go to the smallest shift, then to leaving earlier.
 */
export function suggestDeparture(
	forecast: Forecast,
	start: number,
	durationMin: number,
	mode: Mode,
	options: SuggestOptions
): Suggestion | null {
	const base = windowStats(forecast, start, durationMin);
	if (!base) return null;
	if (!needsAlternative(base, mode)) return null;
	const baseScore = discomfort(base, mode);

	let best: { offset: number; stats: WindowStats; score: number } | null = null;
	for (const offset of OFFSETS) {
		const s = start + offset * 60;
		if (options.now !== undefined && s < options.now) continue;
		const stats = windowStats(forecast, s, durationMin);
		if (!stats) continue;
		const score = discomfort(stats, mode);
		if (!best || score < best.score - 1e-9) best = { offset, stats, score };
	}
	if (!best) return null;
	const gain = baseScore - best.score;
	if (gain < MIN_GAIN || gain < baseScore * MIN_RATIO) return null;

	return {
		offsetMin: best.offset,
		start: best.stats.start,
		stats: best.stats,
		message: describe(base, best.stats, best.offset, mode, options)
	};
}

function describe(
	base: WindowStats,
	alt: WindowStats,
	offset: number,
	mode: Mode,
	{ units, timeZone }: SuggestOptions
): string {
	const r = RULES[mode];
	const when = `Leave ${Math.abs(offset)} min ${offset < 0 ? 'earlier' : 'later'} (${formatClock(alt.start, timeZone)})`;
	const parts: string[] = [];
	if (base.precipProbMax >= r.rainChance && base.precipProbMax - alt.precipProbMax >= 10) {
		parts.push(
			`rain chance ${formatPercent(alt.precipProbMax)} instead of ${formatPercent(base.precipProbMax)}`
		);
	}
	if (base.gustMax >= r.gust && base.gustMax - alt.gustMax >= 5) {
		parts.push(
			`gusts ${formatSpeed(alt.gustMax, units)} instead of ${formatSpeed(base.gustMax, units)}`
		);
	}
	if (parts.length === 0)
		parts.push(alt.precipMax < base.precipMax ? 'lighter rain' : 'calmer conditions');
	return `${when}: ${parts.join(', ')}`;
}

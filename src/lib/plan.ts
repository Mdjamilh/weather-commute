import type { Settings } from './settings';
import { suggestDeparture, type Suggestion } from './suggest';
import { addDays, formatDay, localParts, zonedTimeToUnix } from './time';
import type { Forecast } from './types';
import { verdictFor, type Verdict } from './verdict';
import { windowStats, type WindowStats } from './window';

export type TripKind = 'outbound' | 'inbound';

export interface TripPlan {
	kind: TripKind;
	/** "HH:MM" as configured, in the departure location's zone. */
	departure: string;
	timeZone: string;
	start: number;
	stats: WindowStats | null;
	verdict: Verdict | null;
	suggestion: Suggestion | null;
	/** The trip has already finished. */
	passed: boolean;
}

export interface DayPlan {
	date: string;
	label: string;
	isToday: boolean;
	trips: TripPlan[];
}

export interface PlanInput {
	settings: Settings;
	/** Forecast for the home location; drives the outbound trip and the calendar. */
	home: Forecast;
	/** Forecast for the work location; drives the return trip. Defaults to home. */
	work?: Forecast;
	/** Unix seconds. */
	now: number;
	days?: number;
}

/**
 * Builds today plus the following days. Dates are counted in the home zone. Each
 * departure is read in the zone you leave from, so "17:30 back" means 17:30 at work
 * even if work is in another zone. A trip that falls outside the forecast keeps a
 * null verdict instead of guessing.
 */
export function planWeek({ settings, home, work = home, now, days = 7 }: PlanInput): DayPlan[] {
	const today = localParts(now, home.timezone).date;
	const opts = { units: settings.units };
	const trip = (kind: TripKind, date: string, forecast: Forecast): TripPlan => {
		const departure = kind === 'outbound' ? settings.outbound : settings.inbound;
		const timeZone = forecast.timezone;
		const start = zonedTimeToUnix(date, departure, timeZone);
		const passed = start + settings.durationMin * 60 <= now;
		const stats = windowStats(forecast, start, settings.durationMin);
		return {
			kind,
			departure,
			timeZone,
			start,
			stats,
			verdict: stats ? verdictFor(stats, settings.mode, { ...opts, timeZone }) : null,
			suggestion:
				stats && !passed
					? suggestDeparture(forecast, start, settings.durationMin, settings.mode, {
							...opts,
							timeZone,
							now
						})
					: null,
			passed
		};
	};

	return Array.from({ length: days }, (_, i) => {
		const date = addDays(today, i);
		return {
			date,
			label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : formatDay(date),
			isToday: i === 0,
			trips: [trip('outbound', date, home), trip('inbound', date, work)]
		};
	});
}

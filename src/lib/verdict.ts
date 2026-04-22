import { formatClock } from './time';
import type { Mode, Units } from './types';
import { formatPercent, formatPrecip, formatSpeed, formatTemp } from './units';
import type { WindowStats } from './window';

export type Level = 'good' | 'caution' | 'bad';
export type ReasonKind = 'thunder' | 'ice' | 'rain' | 'snow' | 'wind' | 'cold' | 'heat' | 'uv';

export interface Reason {
	kind: ReasonKind;
	level: Exclude<Level, 'good'>;
	message: string;
}

export interface Verdict {
	level: Level;
	headline: string;
	reasons: Reason[];
}

/** Thresholds per commute mode. Metric: percent, mm per hour, km/h, degrees Celsius. */
export interface ModeRules {
	/** Rain chance (%) at or above which rain is worth mentioning. */
	rainChance: number;
	/** Hourly amount (mm) at or above which rain counts as heavy. */
	heavyRain: number;
	/** Gusts (km/h) at or above which wind is a nuisance. */
	gust: number;
	/** Gusts (km/h) at or above which wind is a real problem. */
	severeGust: number;
	/** Feels-like temperature at or below which to dress up. */
	cold: number;
	/** Feels-like temperature at or above which heat matters. */
	hot: number;
	/** UV index at or above which to mention sunscreen; null to ignore. */
	uv: number | null;
	/** Whether ice and thunderstorms are a blocker (bad) rather than a caution. */
	exposed: boolean;
}

export const RULES: Record<Mode, ModeRules> = {
	walk: {
		rainChance: 40,
		heavyRain: 4,
		gust: 50,
		severeGust: 75,
		cold: 0,
		hot: 30,
		uv: 6,
		exposed: true
	},
	bike: {
		rainChance: 25,
		heavyRain: 1.5,
		gust: 35,
		severeGust: 55,
		cold: 3,
		hot: 28,
		uv: 6,
		exposed: true
	},
	transit: {
		rainChance: 50,
		heavyRain: 4,
		gust: 60,
		severeGust: 85,
		cold: -5,
		hot: 32,
		uv: 8,
		exposed: false
	},
	car: {
		rainChance: 60,
		heavyRain: 6,
		gust: 70,
		severeGust: 95,
		cold: -10,
		hot: 35,
		uv: null,
		exposed: false
	}
};

/** At or below this air temperature, any precipitation can freeze on the ground. */
export const ICE_TEMP = 1;

const THUNDER_CODES = new Set([95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

const RAIN_ACTION: Record<Mode, string> = {
	walk: 'Bring an umbrella',
	bike: 'Pack rain gear',
	transit: 'Bring an umbrella for the walk to the stop',
	car: 'Wet roads, allow extra time'
};

const ORDER: ReasonKind[] = ['thunder', 'ice', 'rain', 'snow', 'wind', 'cold', 'heat', 'uv'];

export interface VerdictOptions {
	units: Units;
	timeZone: string;
}

/**
 * Turns the conditions over one trip into a plain-language verdict for a mode.
 * Pure: same stats, mode and options always give the same verdict.
 */
export function verdictFor(stats: WindowStats, mode: Mode, options: VerdictOptions): Verdict {
	const r = RULES[mode];
	const { units, timeZone } = options;
	const clock = (t: number) => formatClock(t, timeZone);
	// Name the departure time when the hour in question is the one you leave in;
	// name the hour itself when it is later in the trip.
	const around = (t: number) => clock(Math.abs(t - stats.start) <= 1800 ? stats.start : t);
	const reasons: Reason[] = [];
	const add = (kind: ReasonKind, level: Reason['level'], message: string) =>
		reasons.push({ kind, level, message });

	const wet = stats.precipMax > 0 || stats.precipProbMax >= r.rainChance;
	const snowy = stats.weatherCodes.some((c) => SNOW_CODES.has(c));

	if (stats.weatherCodes.some((c) => THUNDER_CODES.has(c))) {
		add(
			'thunder',
			r.exposed ? 'bad' : 'caution',
			mode === 'bike' || mode === 'walk'
				? 'Thunderstorms forecast: consider waiting it out or taking transit'
				: 'Thunderstorms forecast: expect delays'
		);
	}

	if (stats.tempMin <= ICE_TEMP && wet) {
		add(
			'ice',
			mode === 'bike' || mode === 'car' ? 'bad' : 'caution',
			`Ice risk: ${formatTemp(stats.tempMin, units)} with precipitation around ${around(stats.wettestTime)}`
		);
	}

	if (snowy) {
		add('snow', r.exposed ? 'bad' : 'caution', `Snow around ${around(stats.wettestTime)}`);
	} else if (stats.precipProbMax >= r.rainChance) {
		const heavy = stats.precipMax >= r.heavyRain;
		const chance = `${formatPercent(stats.precipProbMax)} chance of rain around ${around(stats.wettestTime)}`;
		if (heavy) {
			add(
				'rain',
				'bad',
				`Heavy rain: ${formatPrecip(stats.precipMax, units)} in an hour, ${chance}` +
					(mode === 'bike' ? '. Consider another way in' : '')
			);
		} else {
			add('rain', 'caution', `${RAIN_ACTION[mode]}: ${chance}`);
		}
	}

	if (stats.gustMax >= r.severeGust) {
		add(
			'wind',
			'bad',
			`Dangerous gusts up to ${formatSpeed(stats.gustMax, units)} around ${around(stats.windiestTime)}`
		);
	} else if (stats.gustMax >= r.gust) {
		add(
			'wind',
			'caution',
			`${mode === 'bike' ? 'Hard riding' : 'Gusty'}: up to ${formatSpeed(stats.gustMax, units)} around ${around(stats.windiestTime)}`
		);
	}

	if (stats.feelsMin <= r.cold) {
		add(
			'cold',
			'caution',
			`${mode === 'car' ? 'Frosty start, defrost the windscreen' : 'Wrap up'}: feels like ${formatTemp(stats.feelsMin, units)}`
		);
	}

	if (stats.feelsMax >= r.hot) {
		add(
			'heat',
			'caution',
			mode === 'car'
				? `Hot car: feels like ${formatTemp(stats.feelsMax, units)}, air it out first`
				: `Heat: feels like ${formatTemp(stats.feelsMax, units)}, take water`
		);
	}

	if (r.uv !== null && stats.uvMax >= r.uv) {
		add('uv', 'caution', `Sunscreen: UV index ${Math.round(stats.uvMax)}`);
	}

	reasons.sort(
		(a, b) =>
			Number(b.level === 'bad') - Number(a.level === 'bad') ||
			ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)
	);

	const top = reasons[0];
	if (!top) {
		const dry = stats.precipProbMax < 20 ? 'dry' : 'probably dry';
		return {
			level: 'good',
			headline: `Good to go: ${formatTemp(stats.tempMax, units)} and ${dry} around ${clock(stats.start)}`,
			reasons
		};
	}
	return { level: top.level, headline: top.message, reasons };
}

import { parseClock } from './time';
import { MODES, type Mode, type Place, type Units } from './types';

export interface Settings {
	home: Place | null;
	work: Place | null;
	/** Usual departure from home, "HH:MM" in the home time zone. */
	outbound: string;
	/** Usual departure from work, "HH:MM" in the work time zone. */
	inbound: string;
	/** Door-to-door trip length in minutes. */
	durationMin: number;
	mode: Mode;
	units: Units;
}

export const STORAGE_KEY = 'weather-commute:settings:v1';

export const DEFAULT_SETTINGS: Settings = {
	home: null,
	work: null,
	outbound: '08:15',
	inbound: '17:30',
	durationMin: 30,
	mode: 'transit',
	units: 'metric'
};

export const MIN_DURATION = 5;
export const MAX_DURATION = 180;

function isValidZone(tz: string): boolean {
	try {
		new Intl.DateTimeFormat('en', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

function parsePlace(v: unknown): Place | null {
	if (typeof v !== 'object' || v === null) return null;
	const p = v as Record<string, unknown>;
	if (
		typeof p.id !== 'number' ||
		typeof p.name !== 'string' ||
		typeof p.latitude !== 'number' ||
		typeof p.longitude !== 'number' ||
		Math.abs(p.latitude) > 90 ||
		Math.abs(p.longitude) > 180 ||
		typeof p.timezone !== 'string' ||
		!isValidZone(p.timezone)
	) {
		return null;
	}
	const opt = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : undefined);
	return {
		id: p.id,
		name: p.name,
		admin1: opt('admin1'),
		country: opt('country'),
		countryCode: opt('countryCode'),
		latitude: p.latitude,
		longitude: p.longitude,
		timezone: p.timezone
	};
}

/**
 * Accepts anything (stored JSON may be old, hand-edited or corrupt) and returns
 * valid settings, falling back to defaults field by field.
 */
export function parseSettings(raw: unknown): Settings {
	if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };
	const r = raw as Record<string, unknown>;
	const clock = (v: unknown, fallback: string) =>
		typeof v === 'string' && parseClock(v) ? v.trim().padStart(5, '0') : fallback;
	const duration =
		typeof r.durationMin === 'number' && Number.isFinite(r.durationMin)
			? Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(r.durationMin)))
			: DEFAULT_SETTINGS.durationMin;
	return {
		home: parsePlace(r.home),
		work: parsePlace(r.work),
		outbound: clock(r.outbound, DEFAULT_SETTINGS.outbound),
		inbound: clock(r.inbound, DEFAULT_SETTINGS.inbound),
		durationMin: duration,
		mode: MODES.includes(r.mode as Mode) ? (r.mode as Mode) : DEFAULT_SETTINGS.mode,
		units: r.units === 'imperial' ? 'imperial' : 'metric'
	};
}

/** Storage can throw (private mode, quota, disabled cookies); never let that break the page. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined): Settings {
	try {
		const text = storage?.getItem(STORAGE_KEY);
		return text ? parseSettings(JSON.parse(text)) : { ...DEFAULT_SETTINGS };
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

export function saveSettings(
	storage: Pick<Storage, 'setItem'> | undefined,
	settings: Settings
): boolean {
	try {
		storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
		return !!storage;
	} catch {
		return false;
	}
}

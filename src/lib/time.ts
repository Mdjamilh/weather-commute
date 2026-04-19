/**
 * Time-zone helpers. Everything is anchored on Unix seconds plus an IANA zone name,
 * never on a fixed UTC offset: Open-Meteo's `utc_offset_seconds` is the offset *now*,
 * which is wrong for any hour on the other side of a daylight-saving change.
 */

export interface LocalParts {
	/** Local calendar date, YYYY-MM-DD. */
	date: string;
	hour: number;
	minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
	let f = formatters.get(timeZone);
	if (!f) {
		f = new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23'
		});
		formatters.set(timeZone, f);
	}
	return f;
}

function rawParts(unix: number, timeZone: string) {
	const out: Record<string, number> = {};
	for (const p of partsFormatter(timeZone).formatToParts(new Date(unix * 1000))) {
		if (p.type !== 'literal') out[p.type] = Number(p.value);
	}
	return {
		year: out.year ?? 1970,
		month: out.month ?? 1,
		day: out.day ?? 1,
		hour: (out.hour ?? 0) % 24,
		minute: out.minute ?? 0,
		second: out.second ?? 0
	};
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Wall-clock date and time of a Unix instant in the given zone. */
export function localParts(unix: number, timeZone: string): LocalParts {
	const p = rawParts(unix, timeZone);
	return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, hour: p.hour, minute: p.minute };
}

/** Offset from UTC in seconds at the given instant (positive east of Greenwich). */
export function offsetAt(unix: number, timeZone: string): number {
	const p = rawParts(unix, timeZone);
	const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000;
	return asUtc - Math.floor(unix);
}

/** Parses "HH:MM" (24-hour). Returns null for anything else. */
export function parseClock(value: string): { hour: number; minute: number } | null {
	const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
	if (!m) return null;
	return { hour: Number(m[1]), minute: Number(m[2]) };
}

/**
 * Converts a wall-clock time on a local date into a Unix instant.
 *
 * - Ambiguous times (the repeated hour when clocks go back) resolve to the first
 *   occurrence, which is what someone with a fixed routine experiences first.
 * - Times that do not exist (skipped when clocks go forward) move forward by the
 *   size of the gap, so 02:30 on a spring-forward night becomes 03:30.
 */
export function zonedTimeToUnix(date: string, clock: string, timeZone: string): number {
	const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	const c = parseClock(clock);
	if (!d || !c) throw new RangeError(`Invalid local time: ${date} ${clock}`);
	const guess = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), c.hour, c.minute) / 1000;
	// Date.UTC silently rolls 2026-13-01 into 2027-01-01; refuse instead.
	if (new Date(guess * 1000).toISOString().slice(0, 10) !== date) {
		throw new RangeError(`Invalid local date: ${date}`);
	}

	const before = offsetAt(guess - 12 * 3600, timeZone);
	const after = offsetAt(guess + 12 * 3600, timeZone);
	const candidates = [...new Set([guess - before, guess - after])].filter((t) => {
		const p = localParts(t, timeZone);
		return p.date === date && p.hour === c.hour && p.minute === c.minute;
	});
	if (candidates.length > 0) return Math.min(...candidates);
	// Gap: interpret with the offset in force before the transition.
	return guess - before;
}

/** Adds whole days to a YYYY-MM-DD date without touching time zones. */
export function addDays(date: string, days: number): string {
	const [y, m, d] = date.split('-').map(Number);
	const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
	return t.toISOString().slice(0, 10);
}

/** "08:15" style clock for an instant in the given zone. */
export function formatClock(unix: number, timeZone: string): string {
	const p = localParts(unix, timeZone);
	return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Short weekday label such as "Sun 25 Oct" for a YYYY-MM-DD date. */
export function formatDay(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	return new Intl.DateTimeFormat('en-GB', {
		timeZone: 'UTC',
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	}).format(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)));
}

/** Shifts an "HH:MM" clock by a number of minutes, wrapping around midnight. */
export function shiftClock(clock: string, minutes: number): string {
	const c = parseClock(clock);
	if (!c) throw new RangeError(`Invalid clock: ${clock}`);
	const total = (((c.hour * 60 + c.minute + minutes) % 1440) + 1440) % 1440;
	return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

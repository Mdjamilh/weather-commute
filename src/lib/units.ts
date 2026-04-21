import type { Units } from './types';

/** Forecast values stay metric internally; these convert only for display. */
export const cToF = (c: number) => (c * 9) / 5 + 32;
export const kmhToMph = (kmh: number) => kmh / 1.609344;
export const mmToIn = (mm: number) => mm / 25.4;

/** Avoids printing "-0" for values such as -0.3 rounded to zero. */
const round = (n: number, digits = 0) => {
	const f = 10 ** digits;
	const r = Math.round(n * f) / f;
	return Object.is(r, -0) ? 0 : r;
};

export function formatTemp(celsius: number, units: Units): string {
	return units === 'imperial' ? `${round(cToF(celsius))}°F` : `${round(celsius)}°C`;
}

export function formatSpeed(kmh: number, units: Units): string {
	return units === 'imperial' ? `${round(kmhToMph(kmh))} mph` : `${round(kmh)} km/h`;
}

export function formatPrecip(mm: number, units: Units): string {
	if (units === 'imperial') {
		const inches = mmToIn(mm);
		return `${inches > 0 && inches < 0.01 ? '<0.01' : round(inches, 2).toFixed(2)} in`;
	}
	return `${mm > 0 && mm < 0.1 ? '<0.1' : round(mm, 1).toFixed(1)} mm`;
}

export function formatPercent(p: number): string {
	return `${round(p)}%`;
}

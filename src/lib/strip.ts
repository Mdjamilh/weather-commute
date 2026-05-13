import { localParts } from './time';
import type { HourSample, Units } from './types';
import { cToF } from './units';

export interface StripBar {
	x: number;
	y: number;
	width: number;
	height: number;
	probability: number;
	time: number;
}

export interface StripTick {
	x: number;
	label: string;
}

export interface StripMarker {
	x: number;
	label: string;
}

export interface StripGeometry {
	width: number;
	height: number;
	bars: StripBar[];
	/** SVG path for the temperature line. Empty when there are fewer than two hours. */
	tempPath: string;
	tempLabels: { x: number; y: number; text: string }[];
	ticks: StripTick[];
	markers: StripMarker[];
	/** y coordinate of the 50% rain-chance guide. */
	halfLine: number;
}

export interface StripOptions {
	width: number;
	height: number;
	timeZone: string;
	units: Units;
	/** Departure instants to mark, with labels. */
	markers?: { time: number; label: string }[];
}

const PAD_TOP = 18;
const PAD_BOTTOM = 18;

/**
 * Lays out one day's hourly strip: rain-chance bars along the bottom, a
 * temperature line across the top and departure markers. Pure geometry, so the
 * Svelte component only draws what this returns and the layout can be tested.
 */
export function stripGeometry(hours: HourSample[], options: StripOptions): StripGeometry {
	const { width, height, timeZone, units } = options;
	const plotH = height - PAD_TOP - PAD_BOTTOM;
	const slot = hours.length > 0 ? width / hours.length : width;
	const first = hours[0]?.time ?? 0;
	const xOf = (t: number) => ((t - first) / 3600) * slot + slot / 2;

	const bars: StripBar[] = hours.map((h, i) => {
		const barH = (Math.max(0, Math.min(100, h.precipProbability)) / 100) * plotH;
		return {
			x: i * slot + slot * 0.15,
			y: PAD_TOP + plotH - barH,
			width: slot * 0.7,
			height: barH,
			probability: h.precipProbability,
			time: h.time
		};
	});

	const temps = hours.map((h) => (units === 'imperial' ? cToF(h.temperature) : h.temperature));
	const lo = Math.min(...temps);
	const hi = Math.max(...temps);
	const span = hi - lo || 1;
	// The temperature line uses the top 60% of the plot so it rarely collides with tall bars.
	const yOf = (v: number) => PAD_TOP + (1 - (v - lo) / span) * plotH * 0.6;
	const points = hours.map((h, i) => [i * slot + slot / 2, yOf(temps[i]!)] as const);
	const tempPath =
		points.length < 2
			? ''
			: points
					.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
					.join(' ');

	const tempLabels: StripGeometry['tempLabels'] = [];
	if (hours.length > 0) {
		const iMax = temps.indexOf(hi);
		const iMin = temps.indexOf(lo);
		for (const i of iMax === iMin ? [iMax] : [iMax, iMin]) {
			const [x, y] = points[i]!;
			tempLabels.push({ x, y: y - 5, text: `${Math.round(temps[i]!)}°` });
		}
	}

	const ticks: StripTick[] = [];
	hours.forEach((h, i) => {
		const { hour } = localParts(h.time, timeZone);
		if (hour % 3 === 0) {
			ticks.push({ x: i * slot + slot / 2, label: String(hour).padStart(2, '0') });
		}
	});

	const last = hours[hours.length - 1]?.time ?? first;
	const markers = (options.markers ?? [])
		.filter((m) => m.time >= first - 1800 && m.time <= last + 1800)
		.map((m) => ({ x: xOf(m.time), label: m.label }));

	// A label near the top would sit on a marker caption; drop it below the line instead.
	for (const label of tempLabels) {
		if (label.y < PAD_TOP + 8 && markers.some((m) => Math.abs(m.x - label.x) < 36)) {
			label.y += 18;
		}
	}

	return {
		width,
		height,
		bars,
		tempPath,
		tempLabels,
		ticks,
		markers,
		halfLine: PAD_TOP + plotH / 2
	};
}

/** The local-day slice of hours to draw, from `fromHour` to `toHour` inclusive. */
export function hoursForDay(
	hours: HourSample[],
	date: string,
	timeZone: string,
	fromHour = 5,
	toHour = 22
): HourSample[] {
	return hours.filter((h) => {
		const p = localParts(h.time, timeZone);
		return p.date === date && p.hour >= fromHour && p.hour <= toHour;
	});
}

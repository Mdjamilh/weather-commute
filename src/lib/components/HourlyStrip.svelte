<script lang="ts">
	import { stripGeometry } from '$lib/strip';
	import { formatClock } from '$lib/time';
	import type { HourSample, Units } from '$lib/types';
	import { formatTemp } from '$lib/units';

	interface Props {
		hours: HourSample[];
		timeZone: string;
		units: Units;
		markers?: { time: number; label: string }[];
		caption: string;
	}

	let { hours, timeZone, units, markers = [], caption }: Props = $props();

	const HEIGHT = 120;
	// Lay out at the real pixel width so labels stay readable on phones and desktops.
	let width = $state(640);

	const g = $derived(
		stripGeometry(hours, { width: Math.max(200, width), height: HEIGHT, timeZone, units, markers })
	);
	const wettest = $derived(
		hours.reduce<HourSample | null>(
			(a, h) => (!a || h.precipProbability > a.precipProbability ? h : a),
			null
		)
	);
	const summary = $derived.by(() => {
		if (hours.length === 0) return `${caption}: no hourly data.`;
		const temps = hours.map((h) => h.temperature);
		const lo = formatTemp(Math.min(...temps), units);
		const hi = formatTemp(Math.max(...temps), units);
		const rain = wettest
			? `highest rain chance ${Math.round(wettest.precipProbability)}% in the hour to ${formatClock(wettest.time, timeZone)}`
			: '';
		return `${caption}: ${lo} to ${hi}, ${rain}.`;
	});
</script>

<figure bind:clientWidth={width}>
	<svg
		width={g.width}
		height={HEIGHT}
		viewBox="0 0 {g.width} {HEIGHT}"
		role="img"
		aria-label={summary}
		class="strip"
	>
		<line class="guide" x1="0" x2={g.width} y1={g.halfLine} y2={g.halfLine} />
		{#each g.bars as bar (bar.time)}
			<rect
				class="bar"
				x={bar.x}
				y={bar.y}
				width={bar.width}
				height={Math.max(bar.height, bar.probability > 0 ? 1 : 0)}
				rx="2"
			>
				<title
					>{Math.round(bar.probability)}% rain chance in the hour to {formatClock(
						bar.time,
						timeZone
					)}</title
				>
			</rect>
		{/each}
		{#if g.tempPath}
			<path class="temp" d={g.tempPath} />
		{/if}
		{#each g.tempLabels as label, i (i)}
			<text class="temp-label" x={label.x} y={label.y} text-anchor="middle">{label.text}</text>
		{/each}
		{#each g.markers as marker (marker.label)}
			<line class="marker" x1={marker.x} x2={marker.x} y1="12" y2={HEIGHT - 16} />
			<text class="marker-label" x={marker.x} y="10" text-anchor="middle">{marker.label}</text>
		{/each}
		{#each g.ticks as tick (tick.x)}
			<text class="tick" x={tick.x} y={HEIGHT - 3} text-anchor="middle">{tick.label}</text>
		{/each}
	</svg>
	<figcaption>
		<span class="key rain"></span> rain chance
		<span class="key temp"></span> temperature
		<span class="key marker"></span> your departures
	</figcaption>
</figure>

<style>
	figure {
		margin: 0;
	}
	.strip {
		display: block;
		max-width: 100%;
		background: var(--surface-2);
		border-radius: 8px;
	}
	.guide {
		stroke: var(--border);
		stroke-dasharray: 3 4;
	}
	.bar {
		fill: var(--rain);
		opacity: 0.75;
	}
	.temp {
		fill: none;
		stroke: var(--temp);
		stroke-width: 2.5;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.temp-label {
		fill: var(--temp);
		font-size: 11px;
		font-weight: 600;
	}
	.marker {
		stroke: var(--text);
		stroke-width: 1.5;
		stroke-dasharray: 2 3;
	}
	.marker-label {
		fill: var(--text);
		font-size: 10px;
		font-weight: 600;
	}
	.tick {
		fill: var(--muted);
		font-size: 10px;
		font-family: var(--mono);
	}
	figcaption {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.5rem;
		margin-top: 0.35rem;
		font-size: 0.78rem;
		color: var(--muted);
	}
	.key {
		display: inline-block;
		width: 12px;
		height: 8px;
		border-radius: 2px;
	}
	.key.rain {
		background: var(--rain);
	}
	.key.temp {
		height: 3px;
		background: var(--temp);
	}
	.key.marker {
		width: 2px;
		height: 12px;
		background: var(--text);
		margin-left: 0.25rem;
	}
</style>

<script lang="ts">
	import type { TripPlan } from '$lib/plan';
	import type { Units } from '$lib/types';
	import { formatPercent, formatPrecip, formatSpeed, formatTemp } from '$lib/units';

	interface Props {
		trip: TripPlan;
		title: string;
		from: string;
		units: Units;
		compact?: boolean;
	}

	let { trip, title, from, units, compact = false }: Props = $props();

	const level = $derived(trip.verdict?.level ?? 'none');
	const levelText = { good: 'Good', caution: 'Heads up', bad: 'Rethink', none: 'No data' } as const;
	const extra = $derived(trip.verdict?.reasons.slice(1) ?? []);
</script>

<article
	class="trip {level}"
	class:compact
	class:passed={trip.passed}
	data-testid="trip-{trip.kind}"
>
	<header>
		<h3>
			{title}
			<span class="when">{trip.departure}</span>
		</h3>
		<span class="badge">{levelText[level]}</span>
	</header>
	<p class="from">From {from}</p>

	{#if trip.verdict && trip.stats}
		<p class="headline">{trip.verdict.headline}</p>
		{#if trip.passed}
			<p class="note">This trip has already happened today.</p>
		{/if}
		{#if !compact && extra.length > 0}
			<ul class="reasons">
				{#each extra as reason (reason.kind)}
					<li>{reason.message}</li>
				{/each}
			</ul>
		{/if}
		{#if trip.suggestion}
			<p class="suggestion" data-testid="suggestion">{trip.suggestion.message}</p>
		{/if}
		{#if !compact}
			<dl class="stats">
				<div>
					<dt>Temperature</dt>
					<dd>
						{formatTemp(
							trip.stats.tempMin,
							units
						)}{#if Math.round(trip.stats.tempMax) !== Math.round(trip.stats.tempMin)}
							to {formatTemp(trip.stats.tempMax, units)}{/if}
					</dd>
				</div>
				<div>
					<dt>Feels like</dt>
					<dd>{formatTemp(trip.stats.feelsMin, units)}</dd>
				</div>
				<div>
					<dt>Rain chance</dt>
					<dd>{formatPercent(trip.stats.precipProbMax)}</dd>
				</div>
				<div>
					<dt>Rain amount</dt>
					<dd>{formatPrecip(trip.stats.precipMax, units)}</dd>
				</div>
				<div>
					<dt>Gusts</dt>
					<dd>{formatSpeed(trip.stats.gustMax, units)}</dd>
				</div>
				<div>
					<dt>UV index</dt>
					<dd>{Math.round(trip.stats.uvMax)}</dd>
				</div>
			</dl>
		{/if}
	{:else}
		<p class="headline">No forecast for this trip yet.</p>
	{/if}
</article>

<style>
	.trip {
		--tone: var(--muted);
		--tone-bg: var(--surface-2);
		display: grid;
		gap: 0.4rem;
		padding: 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 5px solid var(--tone);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
	}
	.trip.good {
		--tone: var(--good);
		--tone-bg: var(--good-bg);
	}
	.trip.caution {
		--tone: var(--caution);
		--tone-bg: var(--caution-bg);
	}
	.trip.bad {
		--tone: var(--bad);
		--tone-bg: var(--bad-bg);
	}
	.trip.passed {
		opacity: 0.7;
	}
	.trip.compact {
		padding: 0.7rem 0.85rem;
		box-shadow: none;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	h3 {
		margin: 0;
		font-size: 1rem;
	}
	.when {
		font-family: var(--mono);
		font-weight: 500;
		color: var(--muted);
		margin-left: 0.35rem;
	}
	.badge {
		padding: 0.1rem 0.55rem;
		border-radius: 999px;
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--tone);
		background: var(--tone-bg);
		white-space: nowrap;
	}
	.from {
		margin: -0.3rem 0 0;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.headline {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
	}
	.compact .headline {
		font-size: 0.95rem;
		font-weight: 500;
	}
	.note {
		margin: 0;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.reasons {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--text);
		font-size: 0.92rem;
	}
	.suggestion {
		margin: 0;
		padding: 0.45rem 0.65rem;
		border-radius: 8px;
		background: var(--surface-2);
		font-size: 0.9rem;
	}
	.suggestion::before {
		content: 'Tip: ';
		font-weight: 700;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
		gap: 0.5rem;
		margin: 0.3rem 0 0;
	}
	.stats div {
		padding: 0.4rem 0.55rem;
		background: var(--surface-2);
		border-radius: 8px;
	}
	dt {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	dd {
		margin: 0;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
</style>

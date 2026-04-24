<script lang="ts">
	import { onMount } from 'svelte';
	import HourlyStrip from '$lib/components/HourlyStrip.svelte';
	import SettingsForm from '$lib/components/SettingsForm.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import TripCard from '$lib/components/TripCard.svelte';
	import { fetchForecast } from '$lib/forecast';
	import { placeLabel } from '$lib/geocode';
	import { planWeek, type DayPlan, type TripPlan } from '$lib/plan';
	import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '$lib/settings';
	import { hoursForDay } from '$lib/strip';
	import { formatClock } from '$lib/time';
	import type { Forecast, Place } from '$lib/types';

	type Load =
		| { status: 'loading'; key: string }
		| { status: 'ready'; key: string; forecast: Forecast; fetchedAt: number }
		| { status: 'error'; key: string; message: string };

	let settings = $state<Settings>({ ...DEFAULT_SETTINGS });
	let ready = $state(false);
	let now = $state(Math.floor(Date.now() / 1000));
	let refreshTick = $state(0);
	let home = $state<Load | null>(null);
	let work = $state<Load | null>(null);

	function storage(): Storage | undefined {
		try {
			return window.localStorage;
		} catch {
			return undefined;
		}
	}

	onMount(() => {
		settings = loadSettings(storage());
		ready = true;
		const timer = setInterval(() => (now = Math.floor(Date.now() / 1000)), 60_000);
		return () => clearInterval(timer);
	});

	$effect(() => {
		const snapshot = $state.snapshot(settings) as Settings;
		if (ready) saveSettings(storage(), snapshot);
	});

	const keyOf = (p: Place | null) =>
		p ? `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}` : '';

	// One request per distinct location, shared when home and work are the same place.
	// Deliberately not reactive: it is a request cache, not UI state.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const inflight = new Map<string, Promise<Forecast>>();
	function load(place: Place, key: string): Promise<Forecast> {
		let p = inflight.get(key);
		if (!p) {
			p = fetchForecast(place);
			inflight.set(key, p);
			p.catch(() => inflight.delete(key));
		}
		return p;
	}

	function track(place: Place | null, set: (value: Load | null) => void) {
		if (!place) {
			set(null);
			return;
		}
		const key = keyOf(place);
		let cancelled = false;
		set({ status: 'loading', key });
		load(place, key).then(
			(forecast) => !cancelled && set({ status: 'ready', key, forecast, fetchedAt: Date.now() }),
			(err: Error) => !cancelled && set({ status: 'error', key, message: err.message })
		);
		return () => {
			cancelled = true;
		};
	}

	$effect(() => {
		void refreshTick;
		return track(settings.home, (v) => (home = v));
	});
	$effect(() => {
		void refreshTick;
		return track(settings.work, (v) => (work = v));
	});

	function refresh() {
		inflight.clear();
		now = Math.floor(Date.now() / 1000);
		refreshTick++;
	}

	const homeForecast = $derived(home?.status === 'ready' ? home.forecast : null);
	const workForecast = $derived(work?.status === 'ready' ? work.forecast : null);
	const samePlace = $derived(!settings.work || keyOf(settings.home) === keyOf(settings.work));

	const days = $derived.by((): DayPlan[] | null => {
		if (!homeForecast) return null;
		if (settings.work && !workForecast) return null;
		return planWeek({
			settings,
			home: homeForecast,
			work: workForecast ?? homeForecast,
			now
		});
	});
	const today = $derived(days?.[0] ?? null);
	const upcoming = $derived(days?.slice(1) ?? []);
	const failed = $derived([home, work].find((l) => l?.status === 'error'));
	const loading = $derived([home, work].some((l) => l?.status === 'loading'));
	const updated = $derived(home?.status === 'ready' ? home.fetchedAt : null);

	const homeName = $derived(settings.home?.name ?? 'home');
	const workName = $derived(settings.work?.name ?? settings.home?.name ?? 'work');

	function marker(trip: TripPlan, label: string) {
		return { time: trip.start, label: `${label} ${trip.departure}` };
	}

	function stripsFor(day: DayPlan) {
		const [out, back] = day.trips as [TripPlan, TripPlan];
		if (!homeForecast) return [];
		if (samePlace) {
			return [
				{
					caption: `${day.label} in ${homeName}`,
					forecast: homeForecast,
					markers: [marker(out, 'Out'), marker(back, 'Back')]
				}
			];
		}
		return [
			{
				caption: `${day.label} in ${homeName}`,
				forecast: homeForecast,
				markers: [marker(out, 'Out')]
			},
			{
				caption: `${day.label} in ${workName}`,
				forecast: workForecast ?? homeForecast,
				markers: [marker(back, 'Back')]
			}
		];
	}
</script>

<svelte:head>
	<title>Should I leave now? Commute weather planner</title>
</svelte:head>

<div class="page">
	<header class="top">
		<div>
			<h1>Should I leave now?</h1>
			<p class="tagline">Weather for the two trips you actually make each day.</p>
		</div>
		<div class="controls">
			<div class="units" role="group" aria-label="Units">
				<button
					type="button"
					aria-pressed={settings.units === 'metric'}
					onclick={() => (settings.units = 'metric')}>°C, km/h</button
				>
				<button
					type="button"
					aria-pressed={settings.units === 'imperial'}
					onclick={() => (settings.units = 'imperial')}>°F, mph</button
				>
			</div>
			<ThemeToggle />
		</div>
	</header>

	<section class="panel" aria-labelledby="setup-heading">
		<h2 id="setup-heading" class="visually-hidden">Your commute</h2>
		<SettingsForm bind:settings />
	</section>

	{#if !ready}
		<p class="status">Loading your settings...</p>
	{:else if !settings.home}
		<section class="empty panel">
			<h2>Start with where you live</h2>
			<p>
				Search for your home and work towns above, set the times you usually leave, and pick how you
				travel. Everything stays in this browser.
			</p>
		</section>
	{:else if failed?.status === 'error'}
		<section class="panel error" role="alert">
			<h2>Could not load the forecast</h2>
			<p>{failed.message}</p>
			<button type="button" class="button" onclick={refresh}>Try again</button>
		</section>
	{:else if !today}
		<p class="status" aria-live="polite">
			{loading ? `Loading the forecast for ${placeLabel(settings.home)}...` : 'Waiting for data...'}
		</p>
	{:else}
		<section class="today" aria-labelledby="today-heading">
			<div class="section-head">
				<h2 id="today-heading">Today</h2>
				<p class="meta">
					{#if updated}Updated {formatClock(updated / 1000, settings.home.timezone)}{/if}
					<button type="button" class="link" onclick={refresh}>Refresh</button>
				</p>
			</div>
			{#if !settings.work}
				<p class="note">No work location set, so the trip back uses the forecast for {homeName}.</p>
			{/if}
			<div class="trips">
				<TripCard trip={today.trips[0]!} title="Going out" from={homeName} units={settings.units} />
				<TripCard
					trip={today.trips[1]!}
					title="Coming back"
					from={workName}
					units={settings.units}
				/>
			</div>
			{#each stripsFor(today) as strip (strip.caption)}
				<HourlyStrip
					hours={hoursForDay(strip.forecast.hours, today.date, strip.forecast.timezone)}
					timeZone={strip.forecast.timezone}
					units={settings.units}
					markers={strip.markers}
					caption={strip.caption}
				/>
			{/each}
		</section>

		<section class="week" aria-labelledby="week-heading">
			<h2 id="week-heading">Next 6 days</h2>
			<ol class="days">
				{#each upcoming as day (day.date)}
					<li>
						<details>
							<summary>
								<span class="day">{day.label}</span>
								{#each day.trips as trip (trip.kind)}
									<span class="pill {trip.verdict?.level ?? 'none'}">
										<span class="pill-time">{trip.departure}</span>
										<span class="pill-text">{trip.verdict?.headline ?? 'No forecast yet'}</span>
									</span>
								{/each}
							</summary>
							<div class="day-body">
								<div class="trips">
									<TripCard
										trip={day.trips[0]!}
										title="Going out"
										from={homeName}
										units={settings.units}
									/>
									<TripCard
										trip={day.trips[1]!}
										title="Coming back"
										from={workName}
										units={settings.units}
									/>
								</div>
								{#each stripsFor(day) as strip (strip.caption)}
									<HourlyStrip
										hours={hoursForDay(strip.forecast.hours, day.date, strip.forecast.timezone)}
										timeZone={strip.forecast.timezone}
										units={settings.units}
										markers={strip.markers}
										caption={strip.caption}
									/>
								{/each}
							</div>
						</details>
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	<footer>
		<p>
			Forecast and place search by <a href="https://open-meteo.com/" rel="noopener">Open-Meteo</a>,
			licensed
			<a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener license">CC BY 4.0</a>.
			Times are shown in each location's own time zone.
		</p>
		<p>
			Verdicts are rules of thumb, not safety advice.
			<a href="https://github.com/Mdjamilh/weather-commute" rel="noopener">Source on GitHub</a>.
		</p>
	</footer>
</div>

<style>
	.page {
		max-width: 60rem;
		margin: 0 auto;
		padding: 1.25rem 1rem 3rem;
		display: grid;
		gap: 1.25rem;
	}
	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 0.75rem 1.5rem;
	}
	h1 {
		margin: 0;
		font-size: clamp(1.6rem, 4vw, 2.2rem);
		letter-spacing: -0.01em;
	}
	.tagline {
		margin: 0.15rem 0 0;
		color: var(--muted);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}
	.units {
		display: inline-flex;
		border: 1px solid var(--border);
		border-radius: 999px;
		overflow: hidden;
	}
	.units button {
		padding: 0.3rem 0.8rem;
		border: none;
		background: var(--surface);
		cursor: pointer;
		font-size: 0.85rem;
	}
	.units button[aria-pressed='true'] {
		background: var(--accent);
		color: var(--accent-text);
		font-weight: 600;
	}
	.panel {
		padding: 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
	}
	.empty h2,
	.error h2 {
		margin-top: 0;
		font-size: 1.15rem;
	}
	.error {
		border-color: var(--bad);
	}
	.status,
	.note {
		margin: 0;
		color: var(--muted);
	}
	.section-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}
	h2 {
		margin: 0 0 0.6rem;
		font-size: 1.25rem;
	}
	.meta {
		margin: 0;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.today,
	.day-body {
		display: grid;
		gap: 0.85rem;
	}
	.trips {
		display: grid;
		gap: 0.85rem;
		grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
	}
	.days {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	details {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	summary {
		display: grid;
		grid-template-columns: 7rem 1fr 1fr;
		align-items: center;
		gap: 0.5rem 0.75rem;
		padding: 0.7rem 0.9rem;
		cursor: pointer;
	}
	summary::marker {
		content: '';
	}
	.day {
		font-weight: 700;
	}
	.pill {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		min-width: 0;
		padding-left: 0.6rem;
		border-left: 4px solid var(--muted);
		font-size: 0.88rem;
	}
	.pill.good {
		border-color: var(--good);
	}
	.pill.caution {
		border-color: var(--caution);
	}
	.pill.bad {
		border-color: var(--bad);
	}
	.pill-time {
		font-family: var(--mono);
		color: var(--muted);
	}
	.pill-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	details[open] .pill-text {
		white-space: normal;
	}
	.day-body {
		padding: 0 0.9rem 0.9rem;
	}
	.button {
		padding: 0.45rem 1rem;
		border: none;
		border-radius: 8px;
		background: var(--accent);
		color: var(--accent-text);
		font-weight: 600;
		cursor: pointer;
	}
	.link {
		background: none;
		border: none;
		padding: 0;
		margin-left: 0.5rem;
		color: var(--accent);
		text-decoration: underline;
		cursor: pointer;
	}
	footer {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
		font-size: 0.85rem;
		color: var(--muted);
	}
	footer p {
		margin: 0.25rem 0;
	}
	@media (max-width: 40rem) {
		summary {
			grid-template-columns: 1fr;
		}
	}
</style>

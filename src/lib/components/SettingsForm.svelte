<script lang="ts">
	import { MAX_DURATION, MIN_DURATION, type Settings } from '$lib/settings';
	import { parseClock } from '$lib/time';
	import { MODES, type Mode } from '$lib/types';
	import CitySearch from './CitySearch.svelte';

	let { settings = $bindable() }: { settings: Settings } = $props();

	const MODE_LABEL: Record<Mode, string> = {
		walk: 'Walk',
		bike: 'Bike',
		transit: 'Transit',
		car: 'Car'
	};

	function setClock(key: 'outbound' | 'inbound', value: string) {
		if (parseClock(value)) settings[key] = value;
	}

	function setDuration(value: number) {
		if (Number.isFinite(value)) {
			settings.durationMin = Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(value)));
		}
	}
</script>

<form class="settings" onsubmit={(e) => e.preventDefault()} aria-label="Commute settings">
	<div class="places">
		<CitySearch
			id="home"
			label="Home"
			value={settings.home}
			onselect={(p) => (settings.home = p)}
		/>
		<CitySearch
			id="work"
			label="Work"
			value={settings.work}
			onselect={(p) => (settings.work = p)}
		/>
	</div>

	<div class="times">
		<label>
			<span>Leave home at</span>
			<input
				type="time"
				value={settings.outbound}
				onchange={(e) => setClock('outbound', e.currentTarget.value)}
			/>
		</label>
		<label>
			<span>Leave work at</span>
			<input
				type="time"
				value={settings.inbound}
				onchange={(e) => setClock('inbound', e.currentTarget.value)}
			/>
		</label>
		<label>
			<span>Trip length (min)</span>
			<input
				type="number"
				inputmode="numeric"
				min={MIN_DURATION}
				max={MAX_DURATION}
				step="5"
				value={settings.durationMin}
				onchange={(e) => setDuration(e.currentTarget.valueAsNumber)}
			/>
		</label>
	</div>

	<fieldset class="modes">
		<legend>How you get there</legend>
		{#each MODES as mode (mode)}
			<label class="chip" class:on={settings.mode === mode}>
				<input type="radio" name="mode" value={mode} bind:group={settings.mode} />
				{MODE_LABEL[mode]}
			</label>
		{/each}
	</fieldset>
</form>

<style>
	.settings {
		display: grid;
		gap: 1rem;
	}
	.places {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
	}
	.times {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
	}
	.times label {
		display: grid;
		gap: 0.3rem;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.times input {
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		font-family: var(--mono);
	}
	.modes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		border: none;
	}
	legend {
		width: 100%;
		margin-bottom: 0.3rem;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.chip {
		position: relative;
		padding: 0.4rem 0.95rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		cursor: pointer;
	}
	.chip.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
		font-weight: 600;
	}
	.chip input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}
	.chip:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
</style>

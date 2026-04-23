<script lang="ts">
	import { placeLabel, searchPlaces } from '$lib/geocode';
	import type { Place } from '$lib/types';

	interface Props {
		id: string;
		label: string;
		value: Place | null;
		onselect: (place: Place | null) => void;
	}

	let { id, label, value, onselect }: Props = $props();

	let query = $state('');
	let results = $state<Place[]>([]);
	let open = $state(false);
	let active = $state(-1);
	let status = $state<'idle' | 'loading' | 'error' | 'empty'>('idle');
	let editing = $state(false);

	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | undefined;

	const listId = $derived(`${id}-results`);

	function search(text: string) {
		clearTimeout(timer);
		controller?.abort();
		if (text.trim().length < 2) {
			results = [];
			open = false;
			status = 'idle';
			return;
		}
		timer = setTimeout(async () => {
			controller = new AbortController();
			status = 'loading';
			try {
				const found = await searchPlaces(text, { signal: controller.signal });
				results = found;
				active = found.length > 0 ? 0 : -1;
				status = found.length > 0 ? 'idle' : 'empty';
				open = true;
			} catch (err) {
				if ((err as Error).name === 'AbortError') return;
				status = 'error';
				results = [];
				open = true;
			}
		}, 250);
	}

	function choose(place: Place) {
		onselect(place);
		query = '';
		results = [];
		open = false;
		editing = false;
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' && results.length > 0) {
			event.preventDefault();
			open = true;
			active = (active + 1) % results.length;
		} else if (event.key === 'ArrowUp' && results.length > 0) {
			event.preventDefault();
			active = (active - 1 + results.length) % results.length;
		} else if (event.key === 'Enter' && open) {
			const picked = results[active];
			if (!picked) return;
			event.preventDefault();
			choose(picked);
		} else if (event.key === 'Escape') {
			open = false;
			if (value) editing = false;
		}
	}
</script>

<div class="city">
	<label for={id}>{label}</label>
	{#if value && !editing}
		<div class="chosen">
			<span class="name">{placeLabel(value)}</span>
			<span class="tz">{value.timezone}</span>
			<button type="button" class="link" onclick={() => (editing = true)}>
				Change<span class="visually-hidden"> {label.toLowerCase()}</span>
			</button>
		</div>
	{:else}
		<div class="combo">
			<input
				{id}
				type="search"
				role="combobox"
				autocomplete="off"
				placeholder="Search for a city"
				aria-autocomplete="list"
				aria-controls={listId}
				aria-expanded={open}
				aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
				bind:value={query}
				oninput={() => search(query)}
				{onkeydown}
				onblur={() => setTimeout(() => (open = false), 150)}
			/>
			{#if value}
				<button type="button" class="link" onclick={() => (editing = false)}>Cancel</button>
			{/if}
			{#if open}
				<ul id={listId} role="listbox" aria-label="{label} suggestions">
					{#each results as place, i (place.id)}
						<li
							id="{listId}-{i}"
							role="option"
							aria-selected={i === active}
							class:active={i === active}
							onmousedown={(e) => {
								e.preventDefault();
								choose(place);
							}}
						>
							<span>{placeLabel(place)}</span>
							<small>{place.timezone}</small>
						</li>
					{/each}
					{#if status === 'empty'}
						<li class="note" role="presentation">No places match "{query}".</li>
					{:else if status === 'error'}
						<li class="note error" role="presentation">City search is unavailable. Try again.</li>
					{/if}
				</ul>
			{/if}
		</div>
		<p class="hint" aria-live="polite">
			{#if status === 'loading'}Searching...{/if}
		</p>
	{/if}
</div>

<style>
	.city {
		display: grid;
		gap: 0.3rem;
	}
	label {
		font-weight: 600;
		font-size: 0.9rem;
	}
	.chosen {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
		padding: 0.5rem 0.75rem;
		background: var(--surface-2);
		border-radius: var(--radius);
	}
	.name {
		font-weight: 600;
	}
	.tz {
		color: var(--muted);
		font-size: 0.85rem;
		font-family: var(--mono);
	}
	.combo {
		position: relative;
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	input {
		width: 100%;
		padding: 0.55rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	ul {
		position: absolute;
		z-index: 10;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		margin: 0;
		padding: 0.25rem;
		list-style: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		max-height: 18rem;
		overflow-y: auto;
	}
	li {
		display: grid;
		padding: 0.45rem 0.6rem;
		border-radius: 6px;
		cursor: pointer;
	}
	li small {
		color: var(--muted);
		font-family: var(--mono);
	}
	li.active {
		background: var(--surface-2);
	}
	li.note {
		cursor: default;
		color: var(--muted);
	}
	li.error {
		color: var(--bad);
	}
	.link {
		background: none;
		border: none;
		padding: 0;
		color: var(--accent);
		text-decoration: underline;
		cursor: pointer;
		white-space: nowrap;
		margin-left: auto;
	}
	.hint {
		margin: 0;
		min-height: 1.2em;
		font-size: 0.8rem;
		color: var(--muted);
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';

	type Theme = 'system' | 'light' | 'dark';
	const KEY = 'weather-commute:theme';

	let theme = $state<Theme>('system');

	function apply(value: Theme) {
		const root = document.documentElement;
		if (value === 'system') delete root.dataset.theme;
		else root.dataset.theme = value;
	}

	onMount(() => {
		try {
			const stored = localStorage.getItem(KEY);
			if (stored === 'light' || stored === 'dark') theme = stored;
		} catch {
			// Storage blocked: stay on the system theme.
		}
		apply(theme);
	});

	function change(value: Theme) {
		theme = value;
		apply(value);
		try {
			if (value === 'system') localStorage.removeItem(KEY);
			else localStorage.setItem(KEY, value);
		} catch {
			// Not fatal; the choice just will not persist.
		}
	}
</script>

<label class="theme">
	<span>Theme</span>
	<select value={theme} onchange={(e) => change(e.currentTarget.value as Theme)}>
		<option value="system">System</option>
		<option value="light">Light</option>
		<option value="dark">Dark</option>
	</select>
</label>

<style>
	.theme {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
	}
	select {
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
	}
</style>

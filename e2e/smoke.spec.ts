import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Recorded Open-Meteo responses (see scripts/record-fixtures.mjs). The forecast covers
// 23 to 29 Oct 2026 in London, including the night the clocks go back.
const fixture = (name: string) =>
	readFileSync(new URL(`../src/lib/__fixtures__/${name}`, import.meta.url), 'utf8');
const geocode = fixture('geocode-london.json');
const forecast = fixture('forecast-london-dst-end.json');

async function routeOpenMeteo(page: Page) {
	const calls = { geocode: 0, forecast: 0 };
	// Anything else leaving the page would be a bug in an offline test. Registered
	// first because Playwright tries the most recently added route first.
	await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
	await page.route('https://geocoding-api.open-meteo.com/v1/search?**', (route) => {
		calls.geocode++;
		return route.fulfill({ contentType: 'application/json', body: geocode });
	});
	await page.route('https://api.open-meteo.com/v1/forecast?**', (route) => {
		calls.forecast++;
		const url = new URL(route.request().url());
		expect(url.searchParams.get('timezone')).toBe('auto');
		expect(url.searchParams.get('timeformat')).toBe('unixtime');
		return route.fulfill({ contentType: 'application/json', body: forecast });
	});
	return calls;
}

async function pickCity(page: Page, field: 'Home' | 'Work', query: string) {
	await page.getByRole('combobox', { name: field }).fill(query);
	const id = field.toLowerCase();
	await page.locator(`#${id}-results [role=option]`).first().click();
	await expect(page.getByText('London, England, United Kingdom').first()).toBeVisible();
}

test('plans a London bike commute from recorded forecasts', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	page.on('pageerror', (e) => errors.push(e.message));

	// 06:00 BST on Friday 23 Oct 2026, before either trip.
	await page.clock.install({ time: new Date('2026-10-23T05:00:00Z') });
	const calls = await routeOpenMeteo(page);
	await page.goto('/');

	await expect(page.getByRole('heading', { name: 'Should I leave now?' })).toBeVisible();
	await expect(page.getByText('Start with where you live')).toBeVisible();

	await pickCity(page, 'Home', 'London');
	await pickCity(page, 'Work', 'London');
	await page.getByText('Bike', { exact: true }).click();

	const out = page.getByTestId('trip-outbound').first();
	const back = page.getByTestId('trip-inbound').first();
	await expect(out).toContainText('Pack rain gear: 100% chance of rain around 08:15');
	await expect(out.getByTestId('suggestion')).toContainText('Leave 45 min later (09:00)');
	await expect(back).toContainText('Dangerous gusts up to 64 km/h around 17:30');
	await expect(back).toContainText('Rethink');

	// The week continues across the clock change with local departure times intact.
	const sunday = page.locator('details', { hasText: 'Sun 25 Oct' });
	await expect(sunday).toContainText('08:15');
	await expect(sunday).toContainText('17:30');

	// Imperial units change the wording without another request.
	await page.getByRole('button', { name: '°F, mph' }).click();
	await expect(back).toContainText('Dangerous gusts up to 40 mph around 17:30');

	// The hourly strip is drawn and labelled for screen readers.
	await expect(page.getByRole('img', { name: /Today in London: .* to .*/ })).toBeVisible();

	// Home and work are the same place, so one forecast request serves both trips.
	expect(calls.forecast).toBe(1);

	// Settings survive a reload.
	await page.reload();
	await expect(page.getByTestId('trip-outbound').first()).toContainText('Pack rain gear');
	await expect(page.getByRole('button', { name: '°F, mph' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	expect(errors).toEqual([]);
});

test('shows a retry when the forecast fails', async ({ page }) => {
	await page.clock.install({ time: new Date('2026-10-23T05:00:00Z') });
	await page.route('https://geocoding-api.open-meteo.com/v1/search?**', (route) =>
		route.fulfill({ contentType: 'application/json', body: geocode })
	);
	let fail = true;
	await page.route('https://api.open-meteo.com/v1/forecast?**', (route) =>
		fail
			? route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ error: true, reason: 'Internal error' })
				})
			: route.fulfill({ contentType: 'application/json', body: forecast })
	);
	await page.goto('/');
	await pickCity(page, 'Home', 'London');
	await expect(page.getByRole('alert')).toContainText('Forecast request failed (500)');
	fail = false;
	await page.getByRole('button', { name: 'Try again' }).click();
	await expect(page.getByTestId('trip-outbound').first()).toBeVisible();
});

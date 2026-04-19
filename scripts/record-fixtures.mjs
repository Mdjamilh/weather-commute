// Records real Open-Meteo responses into src/lib/__fixtures__ so tests run offline
// against data the API actually returned. Run with: node scripts/record-fixtures.mjs
//
// The date ranges are chosen to straddle daylight-saving transitions:
//   - London, clocks go back on 2026-10-25 (BST -> GMT)
//   - New York, clocks go back on 2026-11-01 (EDT -> EST)
//   - Sydney, clocks go forward on 2026-10-04 (AEST -> AEDT)
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src', 'lib', '__fixtures__');

const HOURLY = [
	'temperature_2m',
	'apparent_temperature',
	'precipitation_probability',
	'precipitation',
	'wind_gusts_10m',
	'uv_index',
	'weather_code'
].join(',');

function forecastUrl({ latitude, longitude, start, end }) {
	const p = new URLSearchParams({
		latitude: String(latitude),
		longitude: String(longitude),
		hourly: HOURLY,
		timezone: 'auto',
		timeformat: 'unixtime',
		wind_speed_unit: 'kmh'
	});
	if (start) {
		p.set('start_date', start);
		p.set('end_date', end);
	} else {
		p.set('forecast_days', '7');
	}
	return `https://api.open-meteo.com/v1/forecast?${p}`;
}

const geocodeUrl = (name) =>
	`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: '5', language: 'en', format: 'json' })}`;

const jobs = [
	[
		'forecast-london-dst-end.json',
		forecastUrl({ latitude: 51.50853, longitude: -0.12574, start: '2026-10-23', end: '2026-10-29' })
	],
	[
		'forecast-new-york-dst-end.json',
		forecastUrl({
			latitude: 40.71427,
			longitude: -74.00597,
			start: '2026-10-29',
			end: '2026-11-04'
		})
	],
	[
		'forecast-sydney-dst-start.json',
		forecastUrl({
			latitude: -33.86785,
			longitude: 151.20732,
			start: '2026-10-02',
			end: '2026-10-08'
		})
	],
	['geocode-london.json', geocodeUrl('London')],
	['geocode-new-york.json', geocodeUrl('New York')]
];

async function fetchWithRetry(url, tries = 4) {
	for (let i = 1; ; i++) {
		try {
			const res = await fetch(url);
			if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
			return await res.json();
		} catch (err) {
			if (i >= tries) throw err;
			await new Promise((r) => setTimeout(r, 1000 * i));
		}
	}
}

await mkdir(outDir, { recursive: true });
for (const [file, url] of jobs) {
	const json = await fetchWithRetry(url);
	await writeFile(join(outDir, file), JSON.stringify(json, null, '\t') + '\n');
	console.log(`recorded ${file}`);
}

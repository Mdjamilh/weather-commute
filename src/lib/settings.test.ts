import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	loadSettings,
	parseSettings,
	saveSettings,
	STORAGE_KEY,
	type Settings
} from './settings';

const london = {
	id: 2643743,
	name: 'London',
	admin1: 'England',
	country: 'United Kingdom',
	countryCode: 'GB',
	latitude: 51.50853,
	longitude: -0.12574,
	timezone: 'Europe/London'
};

class MemoryStorage {
	data = new Map<string, string>();
	getItem(k: string) {
		return this.data.get(k) ?? null;
	}
	setItem(k: string, v: string) {
		this.data.set(k, v);
	}
}

describe('parseSettings', () => {
	it('returns defaults for junk', () => {
		for (const junk of [null, 42, 'x', []]) expect(parseSettings(junk)).toEqual(DEFAULT_SETTINGS);
	});

	it('keeps valid fields and repairs invalid ones individually', () => {
		const s = parseSettings({
			home: london,
			work: { ...london, timezone: 'Mars/Olympus_Mons' },
			outbound: '7:45',
			inbound: '25:00',
			durationMin: 1000,
			mode: 'hoverboard',
			units: 'imperial'
		});
		expect(s.home).toEqual(london);
		expect(s.work).toBeNull();
		expect(s.outbound).toBe('07:45');
		expect(s.inbound).toBe('17:30');
		expect(s.durationMin).toBe(180);
		expect(s.mode).toBe('transit');
		expect(s.units).toBe('imperial');
	});

	it('rejects out-of-range coordinates and clamps short durations', () => {
		const s = parseSettings({ home: { ...london, latitude: 123 }, durationMin: 0 });
		expect(s.home).toBeNull();
		expect(s.durationMin).toBe(5);
	});

	it('drops unknown place fields', () => {
		const s = parseSettings({ home: { ...london, population: 8961989 } });
		expect(Object.keys(s.home!)).not.toContain('population');
	});
});

describe('load and save', () => {
	it('round-trips through storage', () => {
		const storage = new MemoryStorage();
		const settings: Settings = { ...DEFAULT_SETTINGS, home: london, mode: 'bike' };
		expect(saveSettings(storage, settings)).toBe(true);
		expect(loadSettings(storage)).toEqual(settings);
	});

	it('survives corrupt JSON and missing storage', () => {
		const storage = new MemoryStorage();
		storage.setItem(STORAGE_KEY, '{not json');
		expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
		expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
		expect(saveSettings(undefined, DEFAULT_SETTINGS)).toBe(false);
	});

	it('reports failure when storage throws', () => {
		const throwing = {
			getItem: () => {
				throw new Error('SecurityError');
			},
			setItem: () => {
				throw new Error('QuotaExceededError');
			}
		};
		expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
		expect(saveSettings(throwing, DEFAULT_SETTINGS)).toBe(false);
	});
});

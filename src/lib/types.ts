export type Mode = 'walk' | 'bike' | 'transit' | 'car';
export type Units = 'metric' | 'imperial';

export const MODES: readonly Mode[] = ['walk', 'bike', 'transit', 'car'];

/** A location picked through the geocoding search. */
export interface Place {
	id: number;
	name: string;
	admin1?: string;
	country?: string;
	countryCode?: string;
	latitude: number;
	longitude: number;
	/** IANA time zone, for example "Europe/London". */
	timezone: string;
}

/** One hourly forecast row. All values are metric, as returned by Open-Meteo. */
export interface HourSample {
	/** Start of the hour as Unix seconds (UTC). */
	time: number;
	/** Air temperature at 2 m, degrees Celsius. */
	temperature: number;
	/** Apparent ("feels like") temperature, degrees Celsius. */
	feelsLike: number;
	/** Precipitation probability, 0 to 100. */
	precipProbability: number;
	/** Precipitation amount for the hour, millimetres. */
	precipitation: number;
	/** Wind gusts at 10 m, km/h. */
	windGust: number;
	uvIndex: number;
	/** WMO weather interpretation code. */
	weatherCode: number;
}

export interface Forecast {
	latitude: number;
	longitude: number;
	/** IANA time zone resolved by `timezone=auto`. */
	timezone: string;
	hours: HourSample[];
}

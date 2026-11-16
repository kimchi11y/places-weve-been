/**
 * Country codes and names. Names come from the runtime (Intl), which already uses the ones
 * families say ("South Korea", "Vietnam") rather than the formal ISO names, and works the
 * same in Node, the browser and Cloudflare Workers.
 */
import codes from 'i18n-iso-countries/codes.json';

/** "KR" → "410": the numeric ids the world-atlas map uses for its countries */
const NUMERIC = new Map((codes as string[][]).map(([alpha2, , numeric]) => [alpha2, numeric]));

export const isCountryCode = (code: string) => NUMERIC.has(code);
export const numericId = (code: string) => NUMERIC.get(code)!;

const names = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'code' });
export const countryName = (code: string) => names.of(code) ?? code;

/** Every country, by name, for pickers. */
export const allCountries = () =>
  [...NUMERIC.keys()].map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name));

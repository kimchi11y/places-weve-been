/** What component tests share: the browser parts jsdom leaves out, and some example trips. */
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import type { Trip } from '../src/lib/types';

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const photo = (id: string) => ({ src: `/${id}/card`, tile: `/${id}/tile`, thumb: `/${id}/thumb` });
export function exampleTrip(id: string, title: string, stops: string[]): Trip {
  return {
    id, title, year: 2025, dates: '', when: 'Apr 2025', days: 5, ink: '#000', tint: '#fff', countries: ['KR'], countryIds: ['410'],
    countryNames: ['South Korea'], continents: ['Asia'], summary: `About ${title}.`, cover: photo(`${id}-cover`), photoCount: stops.length * 2,
    stops: stops.map((name, i) => ({
      name, code: 'ABC', coord: [126, 33], date: '', dateShort: '3 Apr', dateISO: '2025-04-03', dayNo: i + 1, story: `Story of ${name}.`,
      photos: [photo(`${name}-1`), photo(`${name}-2`)], slug: name.toLowerCase(), more: 0,
    })),
  };
}

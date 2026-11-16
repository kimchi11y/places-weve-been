import type { Trip } from './types';

/** Lower-case and strip accents, so "reykjavik" finds "Reykjavík" and "turkiye" finds "Türkiye". */
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export interface Hit {
  trip: Trip;
  /** set when the match was a specific stop, so the postcard can open there */
  stopIndex: number | null;
}

const tripText = (t: Trip) => fold([t.title, t.year, t.when, ...t.countryNames, ...t.continents].join(' '));

export function searchTrips(trips: Trip[], query: string): Hit[] {
  const q = fold(query.trim());
  if (!q) return trips.map((trip) => ({ trip, stopIndex: null }));
  const hits: Hit[] = [];
  for (const trip of trips) {
    const stopIndex = trip.stops.findIndex((s) => fold(s.name).includes(q));
    if (stopIndex >= 0 || tripText(trip).includes(q)) hits.push({ trip, stopIndex: stopIndex >= 0 ? stopIndex : null });
  }
  return hits;
}

/** Split `text` into [before, match, after] for highlighting; match is '' when there is none. */
export function splitMatch(text: string, query: string): [string, string, string] {
  const q = fold(query.trim());
  if (!q) return [text, '', ''];
  // fold character by character so indices still line up with the original text
  let folded = '';
  const starts: number[] = [];
  for (let i = 0; i < text.length; i++) {
    starts.push(folded.length);
    folded += fold(text[i]);
  }
  const at = folded.indexOf(q);
  if (at < 0) return [text, '', ''];
  const from = starts.findIndex((s) => s >= at);
  let to = from;
  while (to < text.length && starts[to] < at + q.length) to++;
  return [text.slice(0, from), text.slice(from, to), text.slice(to)];
}

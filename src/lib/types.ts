/** Plain, serialisable trip data handed from Astro to the React globe island. */
export type Coord = [lng: number, lat: number];

export interface Photo {
  src: string;
  /** the photo-wall size, for cards */
  tile: string;
  thumb: string;
}

export interface Stop {
  name: string;
  code: string;
  coord: Coord;
  /** e.g. "21 September 2025" */
  date: string;
  /** e.g. "21 Sep" */
  dateShort: string;
  dateISO: string;
  /** which day of the trip, counting from 1 */
  dayNo: number;
  story: string;
  photos: Photo[];
  /** anchor of this stop on the trip page, e.g. "seongsan-ilchulbong" */
  slug: string;
  /** photos on the trip page beyond the ones on the postcard */
  more: number;
}

export interface Trip {
  id: string;
  title: string;
  year: number;
  /** e.g. "18 – 27 Sep 2025" */
  dates: string;
  /** e.g. "Sep 2025" */
  when: string;
  days: number;
  /** this trip's ink and its pale paper (lib/ink.ts) */
  ink: string;
  tint: string;
  /** two-letter country codes ("AT", "KR") */
  countries: string[];
  /** ISO numeric ids, matching the world-atlas map features ("040", "410") */
  countryIds: string[];
  countryNames: string[];
  continents: string[];
  summary: string;
  cover: Photo;
  /** every photo on the trip page, not just the postcards */
  photoCount: number;
  vlog?: string;
  stops: Stop[];
}

export interface Stats {
  trips: number;
  countries: number;
  days: number;
}

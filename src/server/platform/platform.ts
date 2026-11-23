/** What differs between the places the site can run. astro.config.mjs points `#platform` at one of them. */
import type { Settings } from '../auth/choose';
import type { PhotoStore } from '../photos/photo-store';
import type { TripStore } from '../stores/trip-store';

export interface Platform {
  tripStore: () => TripStore;
  photoStore: () => PhotoStore;
  settings: Settings;
}

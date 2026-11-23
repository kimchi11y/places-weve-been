/**
 * Where trips are kept. Pages and the editor only use this interface, so the database
 * behind it can change: D1 on Cloudflare and in `npm run dev` (d1.ts), a SQLite file for
 * Docker and the tests (sqlite-file.ts), or anything else that implements it.
 */
import type { NewPhoto, NewTripInput, PhotoRow, TripInput, TripRecord, TripSummary } from '../../schema/trip';

export interface TripStore {
  /** Newest first. Drafts are left out unless asked for. */
  listTrips(options?: { drafts?: boolean }): Promise<TripSummary[]>;
  /** Whole trips with their stops and photos, newest first. Drafts are left out unless asked for. */
  getTrips(options?: { drafts?: boolean }): Promise<TripRecord[]>;
  getTrip(id: string): Promise<TripRecord | undefined>;
  /** Starts a draft trip; its id comes from the title and year, e.g. "jeju-2025". */
  createTrip(input: NewTripInput): Promise<TripRecord>;
  /**
   * Replaces the trip's details and stops. Stops left out are deleted with their photos;
   * `removedPhotoIds` lists those, so their files can be deleted from the photo store.
   */
  saveTrip(id: string, input: TripInput): Promise<{ trip: TripRecord; removedPhotoIds: string[] }>;
  /** Returns the ids of the photos it had, for deleting their files. */
  deleteTrip(id: string): Promise<string[]>;
  /** Records a photo whose files are already in the photo store under the returned id. */
  addPhoto(tripId: string, stopId: string, photo: NewPhoto & { id: string }): Promise<PhotoRow>;
  /** Whether the photo belongs to a trip that's on the site, not a draft. */
  isPhotoPublished(id: string): Promise<boolean>;
  removePhoto(id: string): Promise<void>;
}

export class NotFoundError extends Error {}

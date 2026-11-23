/**
 * What the editor may send, checked with Zod. The field types come from the tables in
 * tables.ts; this file only adds the rules and the messages people see.
 */
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { isCountryCode } from '../lib/countries';
import { slugify } from '../lib/slug';
import { photos, stops, trips } from './tables';

const day = z.iso.date({ error: 'Dates look like 2025-04-03.' });
const unique = (values: string[]) => [...new Set(values)];
const required = (message: string) => z.string().trim().min(1, message);

const tripFields = createInsertSchema(trips, {
  title: required('The trip needs a title.'),
  startDate: day,
  endDate: day,
  countries: z
    .array(
      z.string().trim().toUpperCase().refine(isCountryCode, {
        error: (issue) => `Unknown country code ${issue.input}.`,
      }),
    )
    .min(1, 'Pick at least one country.')
    .transform(unique),
  summary: required('The trip needs a short summary.'),
  story: z.string().trim().default(''),
  vlog: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.url({ protocol: /^https?$/, error: 'The vlog link should start with https://' }).nullable())
    .optional(),
});

export const stopInput = createInsertSchema(stops, {
  name: required('Every stop needs a name.'),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,4}$/, 'The stamp code should be 1–4 letters, like MUC.')
    .toUpperCase(),
  lat: z.number({ error: 'The map position looks wrong.' }).min(-90).max(90),
  lng: z.number({ error: 'The map position looks wrong.' }).min(-180).max(180),
  date: day,
  story: required('Every stop needs a few words of story.'),
  notes: z
    .array(z.string().trim())
    .default([])
    .transform((notes) => notes.filter(Boolean)),
})
  .omit({ tripId: true, position: true, createdAt: true, updatedAt: true })
  .extend({
    /** missing for a stop added in the editor since the trip was loaded */
    id: z.string().optional(),
    /** photo ids picked for the postcard, in order; otherwise the first three are used */
    postcard: z.array(z.string()).max(3, 'A postcard has room for 3 photos.').default([]).transform(unique),
  });

/** A whole trip, as the editor saves it. */
export const tripInput = tripFields
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ stops: z.array(stopInput).default([]) })
  .superRefine((t, ctx) => {
    if (t.endDate < t.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'The trip ends before it starts.' });
    // Each stop gets an anchor on the trip page from its name, so names must stay distinct.
    const seen = new Set<string>();
    t.stops.forEach((s, i) => {
      const slug = slugify(s.name);
      if (!slug) ctx.addIssue({ code: 'custom', path: ['stops', i, 'name'], message: `Stop ${i + 1} needs a name.` });
      else if (seen.has(slug)) ctx.addIssue({ code: 'custom', path: ['stops', i, 'name'], message: `Two stops are called "${s.name}".` });
      seen.add(slug);
      // Drafts may be half finished; a published stop outside the trip would show as "Day 0" or "Day 2000".
      if (!t.draft && (s.date < t.startDate || s.date > t.endDate)) {
        ctx.addIssue({ code: 'custom', path: ['stops', i, 'date'], message: `${s.name}: the arrival date is outside the trip.` });
      }
    });
    if (!t.draft && !t.stops.length) {
      ctx.addIssue({ code: 'custom', path: ['stops'], message: 'Add at least one stop before publishing, or keep it as a draft.' });
    }
  });

/** What the editor sends along with a photo's files. */
export const photoUpload = createInsertSchema(photos, {
  fileName: z.string().trim().min(1).max(200),
  takenAt: z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/).nullable().optional(),
  width: z.int().min(1).max(20_000),
  height: z.int().min(1).max(20_000),
}).pick({ fileName: true, takenAt: true, width: true, height: true });

/** The few fields needed to start a trip; it begins as a draft. */
export const newTripInput = tripFields
  .pick({ title: true, startDate: true, endDate: true, countries: true, summary: true })
  .refine((t) => t.endDate >= t.startDate, { path: ['endDate'], message: 'The trip ends before it starts.' });

export type TripInput = z.input<typeof tripInput>;
export type NewTripInput = z.input<typeof newTripInput>;

export type TripRow = typeof trips.$inferSelect;
export type StopRow = typeof stops.$inferSelect;
export type PhotoRow = typeof photos.$inferSelect;
export type NewPhoto = Omit<typeof photos.$inferInsert, 'id' | 'tripId' | 'stopId' | 'postcard' | 'createdAt'>;

/** A trip with its stops in order, each with its photos in the order they were taken. */
export interface TripRecord extends TripRow {
  stops: (StopRow & { photos: PhotoRow[] })[];
}

export interface TripSummary {
  id: string;
  title: string;
  startDate: string;
  draft: boolean;
}

/** Thrown when what was sent can't be saved; `errors` are sentences for the editor to show. */
export class ValidationError extends Error {
  constructor(public errors: string[]) {
    super(errors[0]);
  }
}

/** Parse with a schema, turning Zod's issues into ValidationError's plain sentences. */
export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError([...new Set(result.error.issues.map((i) => i.message))]);
  return result.data;
}

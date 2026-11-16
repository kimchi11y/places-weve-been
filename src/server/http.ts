/** Small helpers for the editor's API routes (src/pages/admin/api/). */
import type { APIRoute } from 'astro';
import { ValidationError } from '../schema/trip';
import { NotFoundError } from './stores/trip-store';

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

/** Turns thrown errors into answers the editor can show: { error, errors? }. */
export const route = (handler: APIRoute): APIRoute => async (context) => {
  try {
    return await handler(context);
  } catch (error) {
    if (error instanceof ValidationError) return json({ error: error.message, errors: error.errors }, 400);
    if (error instanceof NotFoundError) return json({ error: error.message }, 404);
    console.error('[editor]', error);
    return json({ error: 'Something went wrong on the server. Try again?' }, 500);
  }
};

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ValidationError(['That request wasn’t valid JSON.']);
  }
}

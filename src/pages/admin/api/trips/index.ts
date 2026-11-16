import { json, readJson, route } from '../../../../server/http';
import { tripStore } from '../../../../server/runtime';

export const GET = route(async () => json(await tripStore().listTrips({ drafts: true })));

export const POST = route(async ({ request }) => json(await tripStore().createTrip(await readJson(request)), 201));

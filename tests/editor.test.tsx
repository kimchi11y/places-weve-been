// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Editor from '../src/admin/Editor';
import type { TripRecord } from '../src/schema/trip';
import './dom';

vi.mock('../src/admin/prepare-photo', () => ({
  preparePhoto: async (file: File) => {
    if (file.name.startsWith('bad')) throw new Error('couldn’t be read');
    return { meta: { fileName: file.name }, files: { full: new Blob(['x'], { type: 'image/webp' }) } };
  },
}));

const record = (id: string, title: string, extra: Partial<TripRecord> = {}): TripRecord => ({
  id, title, startDate: '2025-04-03', endDate: '2025-04-08', countries: ['KR', 'JP'], summary: 'Islands.', story: '', vlog: null, draft: true,
  coverPhotoId: null, createdAt: '', updatedAt: '',
  stops: [{ id: `${id}-s1`, tripId: id, position: 0, name: 'Seogwipo', code: 'SGP', lat: 33.25, lng: 126.56, date: '2025-04-07', story: 'Falls.', notes: [], createdAt: '', updatedAt: '', photos: [] }],
  ...extra,
});

/** Stands in for the server: answers at once, unless a test takes over a route. */
let trips: TripRecord[];
let routes: Record<string, (init: RequestInit) => Response | Promise<Response>>;
const calls: string[] = [];
beforeEach(() => {
  trips = [record('jeju', 'Jeju'), record('hanoi', 'Hanoi')];
  routes = {};
  calls.length = 0;
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${url.replace('/admin/api', '')}`;
    calls.push(key);
    if (routes[key]) return routes[key](init);
    if (key === 'GET /trips') return Response.json(trips);
    if (key.startsWith('GET /trips/')) return Response.json(trips.find((t) => key.endsWith(t.id)));
    if (key.startsWith('PUT ')) return Response.json({ ...trips.find((t) => key.endsWith(t.id))!, ...JSON.parse(init.body as string), stops: trips[0].stops });
    if (key === 'POST /trips') return Response.json(record('new', 'New one', { stops: [] }), { status: 201 });
    if (key.endsWith('/photos')) return Response.json({ id: `p${calls.length}`, fileName: 'a.jpg', postcard: null }, { status: 201 });
    throw new Error(`Unexpected ${key}`);
  });
});

async function setup(open?: string) {
  const view = render(<Editor />);
  const user = userEvent.setup();
  await screen.findByRole('button', { name: /Jeju/ });
  if (open) {
    await user.click(link(open));
    await screen.findByRole('heading', { level: 2, name: open });
  }
  return { ...view, user };
}
const link = (title: string) => within(screen.getByRole('navigation')).getByRole('button', { name: new RegExp(title) });
const title = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Title' });
const isLocked = (el: Element) => !!el.closest('[inert]');
/** A route that answers only when the test says so. */
function slow(key: string) {
  let answer!: (response: Response) => void;
  const response = new Promise<Response>((done) => { answer = done; });
  routes[key] = () => response;
  return (data: unknown) => act(async () => answer(Response.json(data)));
}
const button = (name: string | RegExp) => screen.getByRole<HTMLButtonElement>('button', { name });

describe('trip editor', () => {
  it('saves what changed, and says so', async () => {
    const { user } = await setup('Jeju');
    expect(button('Save').disabled).toBe(true);
    await user.type(title(), '!');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    await user.click(button('Save'));
    expect(await screen.findByText(/^Saved\. It’s a draft/)).toBeTruthy();
    expect(title().value).toBe('Jeju!');
    expect(button('Save').disabled).toBe(true);
  });

  it('undoes unsaved changes', async () => {
    const { user } = await setup('Jeju');
    await user.type(title(), '!');
    await user.click(button('Undo changes'));
    expect(title().value).toBe('Jeju');
  });

  it('keeps what was typed when a save is refused, and shows every reason', async () => {
    routes['PUT /trips/jeju'] = () => Response.json({ error: 'a', errors: ['No title.', 'No summary.'] }, { status: 400 });
    const { user } = await setup('Jeju');
    await user.type(title(), '!');
    await user.click(button('Save'));
    expect(await screen.findByText('No summary.')).toBeTruthy();
    expect(title().value).toBe('Jeju!');
    expect(button('Save').disabled).toBe(false);
  });

  it('shows an error page’s status when it isn’t JSON', async () => {
    routes['PUT /trips/jeju'] = () => new Response('<h1>Bad gateway</h1>', { status: 502 });
    const { user } = await setup('Jeju');
    await user.type(title(), '!');
    await user.click(button('Save'));
    expect(await screen.findByText('Something went wrong (502)')).toBeTruthy();
  });

  it('asks before leaving unsaved changes for another trip', async () => {
    const { user } = await setup('Jeju');
    await user.type(title(), '!');
    vi.mocked(confirm).mockReturnValue(false);
    await user.click(link('Hanoi'));
    expect(title().value).toBe('Jeju!');
  });

  it('adds the photos it can, and names the ones it can’t', async () => {
    const { container } = await setup('Jeju');
    const files = ['a.jpg', 'bad.jpg', 'c.jpg'].map((name) => new File(['x'], name, { type: 'image/jpeg' }));
    await act(async () => { fireEvent.change(container.querySelector('input[type=file]')!, { target: { files } }); });
    expect(await screen.findByText('bad.jpg: couldn’t be read')).toBeTruthy();
    expect(container.querySelectorAll('.tiles figure')).toHaveLength(2);
    expect(button('Save').disabled).toBe(true); // photos aren't an unsaved change
  });

  it('wants a name before a new stop gets photos', async () => {
    const { user, container } = await setup('Jeju');
    await user.click(button('+ Add a stop'));
    fireEvent.change(container.querySelectorAll('input[type=file]')[1], { target: { files: [new File(['x'], 'a.jpg')] } });
    expect(screen.getByText('Give the stop a name before adding photos.')).toBeTruthy();
    expect(calls.some((c) => c.startsWith('PUT'))).toBe(false);
  });

  it('reads map positions the way Google Maps copies them, and puts back nonsense', async () => {
    const { user } = await setup('Jeju');
    const box = screen.getByPlaceholderText<HTMLInputElement>('48.14, 11.58');
    await user.clear(box);
    await user.type(box, '16.054407, 108.202167');
    await user.tab();
    expect(box.value).toBe('16.0544, 108.2022');
    await user.clear(box);
    await user.type(box, 'somewhere');
    await user.tab();
    expect(box.value).toBe('16.0544, 108.2022');
  });

  it('suggests a stamp code, when the name has letters for one', async () => {
    const { user, container } = await setup('Jeju');
    await user.click(button('+ Add a stop'));
    const [name, code] = container.querySelectorAll<HTMLInputElement>('.stop ~ .stop input');
    await user.type(name, '東京');
    await user.tab();
    expect(code.value).toBe('');
    await user.clear(name);
    await user.type(name, 'Łódź');
    await user.tab();
    expect(code.value).toBe('LOD');
  });

  it('moves and removes stops', async () => {
    const { user } = await setup('Jeju');
    await user.click(button('+ Add a stop'));
    const names = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names()).toEqual(['01 Seogwipo', '02 New stop']);
    await user.click(screen.getAllByTitle('Move up')[1]);
    expect(names()).toEqual(['01 New stop', '02 Seogwipo']);
    await user.click(screen.getAllByTitle('Remove stop')[0]);
    expect(names()).toEqual(['01 Seogwipo']);
  });

  it('creates a trip', async () => {
    const { user, container } = await setup();
    await user.click(button('+ New trip'));
    await user.type(title(), 'New one');
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(screen.getByText(/^Trip created as a draft/)).toBeTruthy());
    expect(screen.getByRole('heading', { level: 2, name: 'New one' })).toBeTruthy();
  });
});

describe('keeping edits safe', () => {
  it('locks the form and the trip list while saving, so nothing typed is lost', async () => {
    const { user } = await setup('Jeju');
    const answer = slow('PUT /trips/jeju');
    await user.type(title(), '!');
    await user.click(button('Save'));
    expect([isLocked(title()), isLocked(link('Hanoi'))]).toEqual([true, true]);
    await answer(record('jeju', 'Jeju!'));
    expect([isLocked(title()), isLocked(link('Hanoi'))]).toEqual([false, false]);
  });

  it('unlocks when a save fails', async () => {
    routes['PUT /trips/jeju'] = () => { throw new Error('Offline'); };
    const { user } = await setup('Jeju');
    await user.type(title(), '!');
    await user.click(button('Save'));
    expect(await screen.findByText('Offline')).toBeTruthy();
    expect(isLocked(title())).toBe(false);
    expect(title().value).toBe('Jeju!');
  });

  it('locks the form while another trip loads', async () => {
    const { user } = await setup('Jeju');
    const answer = slow('GET /trips/hanoi');
    await user.click(link('Hanoi'));
    expect(isLocked(title())).toBe(true);
    await answer(record('hanoi', 'Hanoi'));
    expect([title().value, isLocked(title())]).toEqual(['Hanoi', false]);
  });

  it('shows the trip clicked last, whichever loads first', async () => {
    const { user } = await setup();
    const answerJeju = slow('GET /trips/jeju');
    await user.click(link('Jeju'));
    await user.click(link('Hanoi'));
    await screen.findByRole('heading', { level: 2, name: 'Hanoi' });
    await answerJeju(record('jeju', 'Jeju'));
    expect(title().value).toBe('Hanoi');
    expect(isLocked(title())).toBe(false);
  });

  it('asks before a new trip replaces unsaved changes', async () => {
    const { user, container } = await setup('Jeju');
    await user.type(title(), '!');
    vi.mocked(confirm).mockReturnValue(false);
    await user.click(button('+ New trip'));
    fireEvent.submit(container.querySelector('form')!);
    expect(confirm).toHaveBeenCalled();
    expect(calls).not.toContain('POST /trips');
    await user.click(button('Cancel'));
    expect(title().value).toBe('Jeju!');
  });

  it('creates a trip once, however often the button is pressed', async () => {
    const { user, container } = await setup();
    const answer = slow('POST /trips');
    await user.click(button('+ New trip'));
    fireEvent.submit(container.querySelector('form')!);
    fireEvent.submit(container.querySelector('form')!);
    await answer(record('new', 'New one'));
    expect(calls.filter((c) => c === 'POST /trips')).toHaveLength(1);
  });

  it('leaves the new trip form when a trip is opened', async () => {
    const { user } = await setup();
    await user.click(button('+ New trip'));
    await user.click(link('Hanoi'));
    expect(await screen.findByRole('heading', { level: 2, name: 'Hanoi' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'New trip' })).toBeNull();
  });
});

describe('odd answers', () => {
  it('explains a page that came back instead of data, such as a sign-in page', async () => {
    routes['GET /trips'] = () => new Response('<h1>Sign in</h1>');
    render(<Editor />);
    expect(await screen.findByText(/unexpected answer/)).toBeTruthy();
    expect(button('+ New trip')).toBeTruthy();
  });

  it('keeps what was typed when a save gets one', async () => {
    routes['PUT /trips/jeju'] = () => new Response('<h1>Sign in</h1>');
    const { user } = await setup('Jeju');
    await user.type(title(), '!');
    await user.click(button('Save'));
    expect(await screen.findByText(/unexpected answer/)).toBeTruthy();
    expect(title().value).toBe('Jeju!');
  });
});

describe('labels', () => {
  it('doesn’t remove a country when its label is clicked', async () => {
    const { user } = await setup('Jeju');
    await user.click(screen.getByText('Countries'));
    expect(screen.getByText('South Korea')).toBeTruthy();
    expect(screen.getByText('Japan')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Countries' })).toBeTruthy();
  });

  it('adds and removes countries by name', async () => {
    const { user } = await setup('Jeju');
    await user.click(button('Remove Japan'));
    expect(screen.queryByText('Japan')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Add a country' }), { target: { value: 'Vietnam (VN)' } });
    expect(button('Remove Vietnam')).toBeTruthy();
  });

  it('names the story box', async () => {
    await setup('Jeju');
    expect(screen.getByRole('textbox', { name: 'The full story' })).toBeTruthy();
  });
});

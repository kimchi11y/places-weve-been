import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { allCountries } from '../lib/countries';
import { slugify } from '../lib/slug';
import type { NewTripInput, PhotoRow, StopRow, TripInput, TripRecord, TripSummary } from '../schema/trip';
import { photoUrl } from '../server/photos/photo-store';
import { preparePhoto } from './prepare-photo';

const API = '/admin/api';

class ApiError extends Error {
  constructor(message: string, public errors: string[] = []) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('x-places-weve-been', '1');
  if (typeof init.body === 'string') headers.set('content-type', 'application/json');
  const res = await fetch(API + path, { ...init, headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error ?? `Something went wrong (${res.status})`, data.errors ?? []);
  }
  return res.json().catch(() => {
    throw new ApiError('The server sent an unexpected answer. You may need to sign in again in another tab.');
  });
}

/** A stop as the form edits it. `id` is missing until a new stop is first saved. */
type EditStop = Pick<StopRow, 'name' | 'code' | 'lat' | 'lng' | 'date' | 'story' | 'notes'> & {
  id?: string;
  /** React's key: the id, or a temporary one for a new stop */
  key: string;
  /** photo ids picked for the postcard, in order */
  postcard: string[];
  /** already uploaded; these change straight away, not on save */
  photos: PhotoRow[];
};

interface EditTrip {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  countries: string[];
  summary: string;
  story: string;
  vlog: string;
  draft: boolean;
  coverPhotoId: string | null;
  stops: EditStop[];
}

const fromRecord = (t: TripRecord): EditTrip => ({
  ...t,
  vlog: t.vlog ?? '',
  stops: t.stops.map((s) => ({
    ...s,
    key: s.id,
    postcard: s.photos.filter((p) => p.postcard !== null).sort((a, b) => a.postcard! - b.postcard!).map((p) => p.id),
  })),
});

const toInput = (t: EditTrip): TripInput => ({
  title: t.title, startDate: t.startDate, endDate: t.endDate, countries: t.countries, summary: t.summary,
  story: t.story, vlog: t.vlog, draft: t.draft, coverPhotoId: t.coverPhotoId,
  stops: t.stops.map(({ id, name, code, lat, lng, date, story, notes, postcard }) => ({ id, name, code, lat, lng, date, story, notes, postcard })),
});

/** What gets saved: everything except the photos, which are uploaded and deleted straight away. */
const saveable = (t: EditTrip | null) => (t ? JSON.stringify(toInput(t)) : '');

const blankStop = (date: string): EditStop => ({
  key: crypto.randomUUID(), name: '', code: '', lat: 0, lng: 0, date, story: '', notes: [], postcard: [], photos: [],
});

interface Country { code: string; name: string }

export default function Editor() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [countries] = useState<Country[]>(allCountries);
  const [trip, setTrip] = useState<EditTrip | null>(null);
  const [saved, setSaved] = useState<EditTrip | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  /** An answer on its way replaces the form, so nothing can be typed into it meanwhile. */
  const [waiting, setWaiting] = useState<'' | 'loading' | 'saving'>('');
  const saving = useRef(false);
  const lastAsked = useRef(0);

  const dirty = saveable(trip) !== saveable(saved);

  useEffect(() => {
    api<TripSummary[]>('/trips').then(setTrips).catch(showError);
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  function showError(err: unknown) {
    setMessage('');
    setErrors(err instanceof ApiError && err.errors.length ? err.errors : [(err as Error).message]);
  }

  function loaded(record: TripRecord) {
    const t = fromRecord(record);
    setTrip(t);
    setSaved(t);
    setErrors([]);
    return t;
  }

  async function open(id: string) {
    if (dirty && !confirm('You have unsaved changes. Leave this trip without saving?')) return;
    setMessage('');
    setWaiting('loading');
    const asked = ++lastAsked.current;
    try {
      const record = await api<TripRecord>(`/trips/${id}`);
      if (asked !== lastAsked.current) return; // another trip was clicked since
      loaded(record);
      setCreating(false);
    } catch (err) {
      if (asked === lastAsked.current) showError(err);
    } finally {
      if (asked === lastAsked.current) setWaiting('');
    }
  }

  /** Runs one save at a time, with the form and the trip list locked until it's done. */
  async function whileSaving<T>(work: () => Promise<T>): Promise<T | null> {
    if (saving.current) return null;
    saving.current = true;
    setWaiting('saving');
    setBusy('Saving…');
    try {
      return await work();
    } catch (err) {
      showError(err);
      return null;
    } finally {
      saving.current = false;
      setWaiting('');
      setBusy('');
    }
  }

  const edit = (change: (t: EditTrip) => void) =>
    setTrip((t) => {
      if (!t) return t;
      const next = structuredClone(t);
      change(next);
      return next;
    });

  /** Photos changed on the server: keep both copies in step so it doesn't count as an unsaved edit. */
  const setPhotos = (stopId: string, change: (photos: PhotoRow[]) => PhotoRow[]) => {
    const apply = (t: EditTrip | null) =>
      t && { ...t, stops: t.stops.map((s) => (s.id === stopId ? { ...s, photos: change(s.photos) } : s)) };
    setTrip(apply);
    setSaved(apply);
  };

  /** Saves, and returns the trip as the server now has it (null if it couldn't). */
  async function save(next = trip): Promise<EditTrip | null> {
    if (!next) return null;
    return whileSaving(async () => {
      const result = loaded(await api<TripRecord>(`/trips/${next.id}`, { method: 'PUT', body: JSON.stringify(toInput(next)) }));
      setTrips(await api<TripSummary[]>('/trips'));
      setMessage(result.draft ? 'Saved. It’s a draft, so only the editor shows it.' : 'Saved. It’s on the site now.');
      return result;
    });
  }

  async function upload(stopIndex: number, files: File[]) {
    if (!trip) return;
    // A new stop gets its id when it's first saved, and photos are stored under that id.
    let current: EditTrip | null = trip;
    if (!trip.stops[stopIndex].id) {
      if (!trip.stops[stopIndex].name.trim()) return showError(new Error('Give the stop a name before adding photos.'));
      current = await save();
      if (!current) return;
    }
    const stop = current.stops[stopIndex];
    setErrors([]);
    const failed: string[] = [];
    for (const [i, file] of files.entries()) {
      setBusy(`Adding photo ${i + 1} of ${files.length}…`);
      try {
        const { meta, files: sizes } = await preparePhoto(file);
        const form = new FormData();
        form.set('stop', stop.id!);
        form.set('meta', JSON.stringify(meta));
        for (const [size, blob] of Object.entries(sizes)) form.set(size, blob, `${size}.${blob.type.split('/')[1]}`);
        const photo = await api<PhotoRow>(`/trips/${current.id}/photos`, { method: 'POST', body: form });
        setPhotos(stop.id!, (photos) => [...photos, photo]);
      } catch (err) {
        failed.push(`${file.name}: ${(err as Error).message}`);
      }
    }
    setBusy('');
    if (failed.length) setErrors(failed);
    else setMessage(`Added ${files.length} photo${files.length === 1 ? '' : 's'}. Location data was removed.`);
  }

  async function deletePhoto(stopId: string, photoId: string) {
    if (!trip || !confirm('Delete this photo? This can’t be undone.')) return;
    try {
      await api(`/photos/${photoId}`, { method: 'DELETE' });
      const unpick = (t: EditTrip | null) =>
        t && {
          ...t,
          coverPhotoId: t.coverPhotoId === photoId ? null : t.coverPhotoId,
          stops: t.stops.map((s) => ({ ...s, postcard: s.postcard.filter((p) => p !== photoId) })),
        };
      setTrip(unpick);
      setSaved(unpick);
      setPhotos(stopId, (photos) => photos.filter((p) => p.id !== photoId));
      setMessage('Photo deleted.');
    } catch (err) {
      showError(err);
    }
  }

  function removeStop(i: number) {
    if (!trip) return;
    const stop = trip.stops[i];
    const count = stop.photos.length;
    const warning = count ? ` Its ${count} photo${count === 1 ? '' : 's'} will be deleted when you save.` : '';
    if (!confirm(`Remove ${stop.name || 'this stop'}?${warning}`)) return;
    edit((t) => {
      t.stops.splice(i, 1);
      if (stop.photos.some((p) => p.id === t.coverPhotoId)) t.coverPhotoId = null;
    });
  }

  async function create(input: NewTripInput) {
    if (dirty && !confirm('You have unsaved changes. Leave this trip without saving?')) return;
    await whileSaving(async () => {
      const t = await api<TripRecord>('/trips', { method: 'POST', body: JSON.stringify(input) });
      setTrips(await api<TripSummary[]>('/trips'));
      setCreating(false);
      loaded(t);
      setMessage('Trip created as a draft. Add stops and photos, then switch on “Show on the site”.');
    });
  }

  return (
    <div className="editor">
      <aside className="sidebar" inert={waiting === 'saving'}>
        <div className="brand">
          <h1>Trip editor</h1>
          <a href="/" target="_blank" rel="noreferrer">View site ↗</a>
        </div>
        <button className="btn primary wide" onClick={() => setCreating(true)}>+ New trip</button>
        <nav>
          {trips.map((t) => (
            <button key={t.id} className={`trip-link${trip?.id === t.id ? ' active' : ''}`} onClick={() => open(t.id)}>
              <span>{t.title}</span>
              <small>{t.startDate.slice(0, 4)}{t.draft && <em className="badge">Draft</em>}</small>
            </button>
          ))}
        </nav>
        <p className="hint">
          Saved changes show on the site straight away. Photos are added and deleted as soon as you do it.
        </p>
      </aside>

      <main inert={!!waiting}>
        {creating && <NewTrip countries={countries} onCreate={create} onCancel={() => setCreating(false)} />}
        {!trip && !creating && (
          <div className="empty">
            <h2>Pick a trip on the left, or start a new one.</h2>
          </div>
        )}
        {trip && !creating && (
          <TripForm
            trip={trip}
            countries={countries}
            edit={edit}
            onUpload={upload}
            onDeletePhoto={deletePhoto}
            onRemoveStop={removeStop}
          />
        )}
      </main>

      {(trip || errors.length > 0 || message) && (
        <footer className="savebar">
          <div className="status">
            {busy ? <span>{busy}</span>
              : errors.length ? <ul className="errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
              : dirty ? <span>Unsaved changes</span>
              : <span className="ok">{message}</span>}
          </div>
          {trip && (
            <>
              <button className="btn" disabled={!dirty || !!busy || !!waiting} onClick={() => { setTrip(saved); setErrors([]); }}>Undo changes</button>
              <button className="btn primary" disabled={!dirty || !!busy || !!waiting} onClick={() => save()}>Save</button>
            </>
          )}
        </footer>
      )}
    </div>
  );
}

// ---------- trip ----------

function TripForm({ trip, countries, edit, onUpload, onDeletePhoto, onRemoveStop }: {
  trip: EditTrip;
  countries: Country[];
  edit: (change: (t: EditTrip) => void) => void;
  onUpload: (stopIndex: number, files: File[]) => void;
  onDeletePhoto: (stopId: string, photoId: string) => void;
  onRemoveStop: (i: number) => void;
}) {
  const moveStop = (from: number, to: number) => edit((t) => void t.stops.splice(to, 0, ...t.stops.splice(from, 1)));
  return (
    <div className="form">
      <section className="card">
        <div className="card-head">
          <h2>{trip.title || 'Untitled trip'}</h2>
          <label className="switch">
            <input type="checkbox" checked={!trip.draft} onChange={(e) => edit((t) => void (t.draft = !e.target.checked))} />
            <span>Show on the site</span>
          </label>
        </div>
        <div className="grid">
          <Field label="Title" wide>
            <input value={trip.title} onChange={(e) => edit((t) => void (t.title = e.target.value))} />
          </Field>
          <Field label="First day">
            <input type="date" value={trip.startDate} onChange={(e) => edit((t) => void (t.startDate = e.target.value))} />
          </Field>
          <Field label="Last day">
            <input type="date" value={trip.endDate} onChange={(e) => edit((t) => void (t.endDate = e.target.value))} />
          </Field>
          <Field label="Countries" group wide>
            <CountryPicker countries={countries} value={trip.countries} onChange={(v) => edit((t) => void (t.countries = v))} />
          </Field>
          <Field label="Summary" hint="One or two sentences, shown on the globe." wide>
            <textarea rows={2} value={trip.summary} onChange={(e) => edit((t) => void (t.summary = e.target.value))} />
          </Field>
          <Field label="YouTube vlog" hint="Optional." wide>
            <input type="url" placeholder="https://youtu.be/…" value={trip.vlog} onChange={(e) => edit((t) => void (t.vlog = e.target.value))} />
          </Field>
        </div>
      </section>

      <h2 className="section-title">Stops <small>in the order you travelled</small></h2>
      {trip.stops.map((stop, i) => (
        <StopCard
          key={stop.key}
          index={i}
          count={trip.stops.length}
          trip={trip}
          stop={stop}
          edit={(change) => edit((t) => change(t.stops[i], t))}
          onMove={(to) => moveStop(i, to)}
          onRemove={() => onRemoveStop(i)}
          onUpload={(files) => onUpload(i, files)}
          onDeletePhoto={(photoId) => onDeletePhoto(stop.id!, photoId)}
        />
      ))}
      <button className="btn wide dashed" onClick={() => edit((t) => void t.stops.push(blankStop(t.stops.at(-1)?.date ?? t.startDate)))}>
        + Add a stop
      </button>

      <section className="card">
        <h2 id="full-story">The full story</h2>
        <p className="hint">Shown on the trip page. Blank lines start new paragraphs; **bold** and [links](https://…) work too.</p>
        <textarea className="story" aria-labelledby="full-story" rows={10} value={trip.story} onChange={(e) => edit((t) => void (t.story = e.target.value))} />
      </section>
    </div>
  );
}

// ---------- stop ----------

function StopCard({ index, count, trip, stop, edit, onMove, onRemove, onUpload, onDeletePhoto }: {
  index: number;
  count: number;
  trip: EditTrip;
  stop: EditStop;
  edit: (change: (s: EditStop, t: EditTrip) => void) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  onUpload: (files: File[]) => void;
  onDeletePhoto: (photoId: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const photos = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/') || /\.hei[cf]$/i.test(f.name));
    if (photos.length) onUpload(photos);
  };

  return (
    <section className="card stop">
      <div className="card-head">
        <h3><span className="num">{String(index + 1).padStart(2, '0')}</span> {stop.name || 'New stop'}</h3>
        <div className="actions">
          <button className="icon" title="Move up" disabled={index === 0} onClick={() => onMove(index - 1)}>↑</button>
          <button className="icon" title="Move down" disabled={index === count - 1} onClick={() => onMove(index + 1)}>↓</button>
          <button className="icon danger" title="Remove stop" onClick={onRemove}>✕</button>
        </div>
      </div>
      <div className="grid">
        <Field label="Place">
          <input
            value={stop.name}
            placeholder="e.g. Hallstatt"
            onChange={(e) => edit((s) => void (s.name = e.target.value))}
            onBlur={() => edit((s) => void (s.code ||= slugify(s.name).replace(/[^a-z0-9]/g, '').slice(0, 3).toUpperCase()))}
          />
        </Field>
        <Field label="Stamp code" hint="Up to 4 letters.">
          <input value={stop.code} maxLength={4} onChange={(e) => edit((s) => void (s.code = e.target.value.toUpperCase()))} />
        </Field>
        <Field label="Arrived">
          <input type="date" value={stop.date} onChange={(e) => edit((s) => void (s.date = e.target.value))} />
        </Field>
        <Field label="Map position" hint={<>In Google Maps, right-click the place and click the numbers to copy them. <a href={`https://www.google.com/maps/search/${encodeURIComponent(stop.name)}`} target="_blank" rel="noreferrer">Open maps ↗</a></>}>
          <Coords lat={stop.lat} lng={stop.lng} onChange={(lat, lng) => edit((s) => Object.assign(s, { lat, lng }))} />
        </Field>
        <Field label="Postcard story" wide>
          <textarea rows={3} value={stop.story} onChange={(e) => edit((s) => void (s.story = e.target.value))} />
        </Field>
        <Field label="Handwritten notes" hint="Optional. One per line; they fill gaps in the photo wall." wide>
          <textarea rows={2} value={stop.notes.join('\n')} onChange={(e) => edit((s) => void (s.notes = e.target.value.split('\n')))} />
        </Field>
      </div>

      <div
        className={`photos${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <div className="photos-head">
          <strong>Photos</strong>
          <span className="hint">
            {stop.photos.length ? `${stop.photos.length} · ` : ''}
            {stop.postcard.length ? '★ = on the postcard' : 'Star up to 3 for the postcard, or the first 3 are used.'}
          </span>
          <button className="btn small" onClick={() => picker.current?.click()}>Add photos</button>
          <input
            ref={picker}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            hidden
            onChange={(e) => { onUpload([...(e.target.files ?? [])]); e.target.value = ''; }}
          />
        </div>
        {stop.photos.length === 0 && <p className="dropzone">Drag photos here</p>}
        <div className="tiles">
          {stop.photos.map((photo) => {
            const pick = stop.postcard.indexOf(photo.id);
            return (
              <figure key={photo.id} className={pick >= 0 ? 'picked' : ''}>
                <img src={photoUrl(photo.id, 'thumb')} alt={photo.fileName} loading="lazy" />
                {pick >= 0 && <span className="pick-num">★ {pick + 1}</span>}
                {trip.coverPhotoId === photo.id && <span className="cover-tag">Cover</span>}
                <figcaption>
                  <button
                    title={pick >= 0 ? 'Take off the postcard' : 'Put on the postcard'}
                    disabled={pick < 0 && stop.postcard.length >= 3}
                    onClick={() => edit((s) => void (s.postcard = pick >= 0 ? s.postcard.filter((p) => p !== photo.id) : [...s.postcard, photo.id]))}
                  >{pick >= 0 ? '★' : '☆'}</button>
                  <button
                    title="Use as the trip's cover photo"
                    onClick={() => edit((_, t) => void (t.coverPhotoId = t.coverPhotoId === photo.id ? null : photo.id))}
                  >Cover</button>
                  <button title="Delete photo" className="danger" onClick={() => onDeletePhoto(photo.id)}>🗑</button>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------- small inputs ----------

/** `group` is for several controls under one label: a <label> would pass clicks on to the first of them. */
function Field({ label, hint, wide, group, children }: { label: string; hint?: ReactNode; wide?: boolean; group?: boolean; children: ReactNode }) {
  const Box = group ? 'div' : 'label';
  return (
    <Box className={`field${wide ? ' wide' : ''}`} {...(group && { role: 'group', 'aria-label': label })}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </Box>
  );
}

/** One box for "48.14, 11.58", the way Google Maps copies it. */
function Coords({ lat, lng, onChange }: { lat: number; lng: number; onChange: (lat: number, lng: number) => void }) {
  const shown = lat || lng ? `${lat}, ${lng}` : '';
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const parse = () => {
    const m = text.match(/(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)/);
    if (m) onChange(Math.round(+m[1] * 1e4) / 1e4, Math.round(+m[2] * 1e4) / 1e4);
    else setText(shown);
  };
  return <input value={text} placeholder="48.14, 11.58" onChange={(e) => setText(e.target.value)} onBlur={parse} />;
}

function CountryPicker({ countries, value, onChange }: { countries: Country[]; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const nameOf = (code: string) => countries.find((c) => c.code === code)?.name ?? code;
  /** Picking from the list fills in "Vietnam (VN)"; someone still typing hasn't chosen yet ("vi" isn't the Virgin Islands). */
  const type = (input: string) => {
    setText(input);
    if (/\([A-Z]{2}\)$/.test(input)) choose(input);
  };
  const choose = (input: string) => {
    const q = input.trim().toLowerCase();
    const match = countries.find((c) => `${c.name} (${c.code})`.toLowerCase() === q || c.name.toLowerCase() === q || c.code.toLowerCase() === q);
    if (!match) return;
    if (!value.includes(match.code)) onChange([...value, match.code]);
    setText('');
  };
  return (
    <div className="chips">
      {value.map((code) => (
        <span key={code} className="chip">
          {nameOf(code)}
          <button type="button" title="Remove" aria-label={`Remove ${nameOf(code)}`} onClick={() => onChange(value.filter((c) => c !== code))}>×</button>
        </span>
      ))}
      <input
        list="country-list"
        aria-label="Add a country"
        value={text}
        placeholder={value.length ? 'Add another…' : 'Start typing a country…'}
        onChange={(e) => type(e.target.value)}
        onBlur={() => { if (text.trim().length > 2) choose(text); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); choose(text); } }}
      />
      <datalist id="country-list">
        {countries.map((c) => <option key={c.code} value={`${c.name} (${c.code})`} />)}
      </datalist>
    </div>
  );
}

function NewTrip({ countries, onCreate, onCancel }: {
  countries: Country[];
  onCreate: (t: NewTripInput) => void;
  onCancel: () => void;
}) {
  const [t, setT] = useState({ title: '', startDate: '', endDate: '', countries: [] as string[], summary: '' });
  const set = (patch: Partial<typeof t>) => setT({ ...t, ...patch });
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); onCreate(t); }}>
      <h2>New trip</h2>
      <p className="hint">It starts as a draft, hidden from the site until you switch it on.</p>
      <div className="grid">
        <Field label="Title" wide><input required value={t.title} placeholder="e.g. Vietnam" onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="First day"><input required type="date" value={t.startDate} onChange={(e) => set({ startDate: e.target.value, endDate: t.endDate || e.target.value })} /></Field>
        <Field label="Last day"><input required type="date" value={t.endDate} onChange={(e) => set({ endDate: e.target.value })} /></Field>
        <Field label="Countries" group wide><CountryPicker countries={countries} value={t.countries} onChange={(v) => set({ countries: v })} /></Field>
        <Field label="Summary" hint="One or two sentences, shown on the globe." wide>
          <textarea required rows={2} value={t.summary} onChange={(e) => set({ summary: e.target.value })} />
        </Field>
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary">Create trip</button>
      </div>
    </form>
  );
}

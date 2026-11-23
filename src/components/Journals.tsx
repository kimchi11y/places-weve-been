import { forwardRef, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';
import { carryPhoto } from '../lib/carry-photo';
import { plural } from '../lib/format';
import type { Trip } from '../lib/types';
import { Icon, Sticker } from './icons';

/** Tabs that stay visible as cards stack up; more than this and older cards are simply covered. */
const MAX_TABS = 6;

/** One stamp per country, most-visited first. Each trip to two countries counts for both. */
function countriesOf(trips: Trip[]) {
  const map = new Map<string, { code: string; name: string; trips: Trip[] }>();
  for (const t of trips) {
    t.countries.forEach((code, i) => {
      const entry = map.get(code) ?? { code, name: t.countryNames[i], trips: [] };
      entry.trips.push(t);
      map.set(code, entry);
    });
  }
  return [...map.values()].sort((a, b) => b.trips.length - a.trips.length || a.name.localeCompare(b.name));
}

/** A second photo for a card: the first that isn't the cover. */
const otherPhoto = (t: Trip) => t.stops.flatMap((s) => s.photos).find((p) => p.src !== t.cover.src) ?? t.cover;

const carryCover = (e: MouseEvent<HTMLAnchorElement>) => carryPhoto(e.currentTarget.querySelector<HTMLElement>('[data-carry]'));

export default forwardRef<HTMLElement, { trips: Trip[]; canEdit: boolean }>(function Journals({ trips, canEdit }, ref) {
  const [country, setCountry] = useState<string | null>(null);
  const countries = useMemo(() => countriesOf(trips), [trips]);
  const list = country ? trips.filter((t) => t.countries.includes(country)) : trips;

  return (
    <section className="shelf" id="journals" ref={ref} aria-labelledby="journals-title">
      <div className="shelf-in">
        <h2 id="journals-title">Every trip, <em className="i">kept</em></h2>
        {trips.length > 0 ? (
          <>
            <p className="shelf-lede">Our passport and all our journals. Tap a stamp to see one country, or open a journal to read the whole trip.</p>
            <div className="stamps" role="group" aria-label="Show one country">
              <button className="stamp-btn" aria-pressed={!country} onClick={() => setCountry(null)}>
                <span className="stamp-wrap"><span className="stamp"><span className="stamp-all">All</span></span></span>
                <small>{plural(trips.length, 'trip')}</small>
              </button>
              {countries.map((c) => (
                <button key={c.code} className="stamp-btn" aria-pressed={country === c.code} onClick={() => setCountry(c.code)}
                  style={{ '--t': c.trips[0].ink } as CSSProperties}>
                  <span className="stamp-wrap"><span className="stamp"><span className="stamp-face"><img src={c.trips[0].cover.thumb} alt="" loading="lazy" /><b>{c.code}</b></span></span></span>
                  <small>{c.name}</small>
                </button>
              ))}
            </div>
            <div className="folders" style={{ '--n': Math.min(MAX_TABS, list.length) } as CSSProperties}>
              {list.map((t, i) => (
                <a key={t.id} className="folder" href={`/trips/${t.id}`} onClick={carryCover}
                  style={{ '--t': t.ink, '--tint': t.tint, '--i': i % MAX_TABS } as CSSProperties}>
                  <h3 className="tab"><Icon name="pin" /><span>{t.title}</span> <i className="ink-small">{t.year}</i></h3>
                  <span className="f-days">{plural(t.days, 'day')}</span>
                  <span className="folder-body">
                    <span className="f-photos">
                      <span className="print"><img src={otherPhoto(t).tile} alt="" loading="lazy" /></span>
                      <span className="print"><img data-carry src={t.cover.tile} alt="" loading="lazy" /></span>
                    </span>
                    <span className="f-text">
                      <span>
                        <span className="f-sum">{t.summary}</span>
                        <small>{plural(t.stops.length, 'place')} · {plural(t.photoCount, 'photo')}</small>
                      </span>
                      <span className="go"><Icon name="arrow" /></span>
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </>
        ) : (
          <div className="no-trips">
            <Sticker name="cam" />
            <p className="hand">No trips here yet.{canEdit && <> The first one starts in the <a href="/admin">trip editor</a>.</>}</p>
          </div>
        )}
      </div>
    </section>
  );
});

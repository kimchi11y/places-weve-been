import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { pad, plural } from '../lib/format';
import type { Trip } from '../lib/types';
import { Icon } from './icons';

interface Props {
  trip: Trip | null;
  stop: number;
  /** several trips close together on the globe: choose one */
  picker: Trip[] | null;
  onStop: (i: number) => void;
  onPick: (trip: Trip) => void;
  onClose: () => void;
}

const inkOf = (t: Trip) => ({ '--t': t.ink, '--tint': t.tint }) as CSSProperties;

/** A trip on the globe: the bottom sheet on phones, a card beside the globe on wider screens. */
export default function TripSheet({ trip, stop, picker, onStop, onPick, onClose }: Props) {
  const sheetRef = useRef<HTMLElement>(null);
  const photoRef = useRef<HTMLImageElement>(null);
  const opener = useRef<Element | null>(null);
  const [photo, setPhoto] = useState(0);
  const open = !!trip || !!picker;

  // Keep the last trip on screen while the sheet slides away
  const [lastTrip, setLastTrip] = useState(trip);
  if (trip && trip !== lastTrip) setLastTrip(trip);
  const shown = trip ?? lastTrip;

  useEffect(() => setPhoto(0), [trip, stop]);

  useEffect(() => {
    if (open) {
      opener.current = document.activeElement;
      sheetRef.current!.focus({ preventScroll: true });
    } else if (opener.current instanceof HTMLElement && opener.current.isConnected) {
      opener.current.focus({ preventScroll: true });
    }
  }, [open]);

  // Swipe the handle down to close
  const swipe = useRef<number | null>(null);
  const dy = useRef(0);
  const onGrabDown = (e: PointerEvent<HTMLElement>) => {
    swipe.current = e.clientY;
    dy.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
    sheetRef.current!.style.transition = 'none';
  };
  const onGrabMove = (e: PointerEvent) => {
    if (swipe.current === null) return;
    dy.current = Math.max(0, e.clientY - swipe.current);
    sheetRef.current!.style.transform = `translateY(${dy.current}px)`;
  };
  const onGrabEnd = () => {
    if (swipe.current === null) return;
    swipe.current = null;
    sheetRef.current!.style.transition = '';
    sheetRef.current!.style.transform = '';
    if (dy.current > 90) onClose();
  };

  const grab = (
    <div className="sh-grab" aria-hidden="true" onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabEnd} onPointerCancel={onGrabEnd}><i /></div>
  );

  const current = shown?.stops[Math.min(stop, shown.stops.length - 1)];
  const photos = current?.photos ?? [];
  const here = photos[photo % Math.max(1, photos.length)] ?? shown?.cover;

  return (
    <aside ref={sheetRef} className={`sheet${open ? ' open' : ''}`} aria-label={picker ? 'Choose a trip' : shown?.title ?? 'Trip'} inert={!open} tabIndex={-1}
      style={!picker && shown ? inkOf(shown) : undefined}>
      {picker ? (
        <>
          {grab}
          <button className="sh-close" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          <div className="sh-scroll">
            <p className="eyebrow">{plural(picker.length, 'trip')} close together</p>
            <h2 className="sh-title">Which <em className="i">trip?</em></h2>
            <div className="pick">
              {picker.map((t) => (
                <button key={t.id} style={inkOf(t)} onClick={() => onPick(t)}>
                  <img src={t.cover.thumb} alt="" />
                  <span><b>{t.title}</b><span>{t.year} · {t.stops.map((s) => s.name).join(', ')}</span></span>
                  <Icon name="arrow" />
                </button>
              ))}
            </div>
          </div>
        </>
      ) : shown && (
        <>
          {grab}
          <button className="sh-close" onClick={onClose} aria-label="Back to the globe"><Icon name="x" /></button>
          <div className="sh-scroll">
            <div className="sh-head">
              <div>
                <p className="eyebrow">{shown.year} · {plural(shown.days, 'day')}</p>
                <h2 className="sh-title"><em className="i">{shown.title}</em></h2>
                <p>{shown.summary}</p>
              </div>
              <button className="print sh-print" onClick={() => setPhoto((p) => p + 1)} disabled={photos.length < 2}
                aria-label={photos.length > 1 ? `Next photo of ${current?.name}` : `${current?.name}`}>
                <span className="tape" />
                <img ref={photoRef} src={here?.tile} alt="" />
              </button>
            </div>
            <ol className="days">
              {shown.stops.map((s, i) => (
                <li key={s.slug}>
                  <button className="day" aria-current={i === stop} onClick={() => onStop(i)}>
                    <span className="ring" />
                    <span><b>{s.name}</b><span className="d">Day {pad(s.dayNo)} · {s.dateShort}</span></span>
                    <img src={s.photos[0]?.thumb} alt="" loading="lazy" />
                  </button>
                  {i === stop && (
                    <div className="day-more">
                      <p>{s.story}</p>
                      {s.more > 0 && <a href={`/trips/${shown.id}#${s.slug}`}>+{plural(s.more, 'more photo')}</a>}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <div className="sh-foot">
            <a className="cta" href={`/trips/${shown.id}`} onClick={() => { if (photoRef.current) photoRef.current.style.viewTransitionName = 'vt-cover'; }}>
              Open the journal <span className="arrow"><Icon name="arrow" /></span>
            </a>
            {shown.vlog && <a className="ghost vlog-link" href={shown.vlog} target="_blank" rel="noreferrer" aria-label={`Watch the ${shown.title} vlog`}><Icon name="play" /> Vlog</a>}
          </div>
        </>
      )}
    </aside>
  );
}

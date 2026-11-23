import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { AnimatePresence, domAnimation, LazyMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { searchTrips, splitMatch } from '../lib/search';
import type { Trip } from '../lib/types';
import { Icon } from './icons';

interface Props {
  trips: Trip[];
  open: boolean;
  onClose: () => void;
  onPick: (trip: Trip, stopIndex: number) => void;
  onPeek: (trip: Trip | null) => void;
}

/**
 * The shortcut hint for this device: "⌘K" on Mac/iPad keyboards, "Ctrl K" on Windows/Linux,
 * nothing on touch-only devices. Decided after mount so server and client HTML match.
 */
export function useShortcutLabel() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!matchMedia('(any-pointer: fine)').matches) return;
    const platform = (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ?? navigator.platform;
    setLabel(/mac|iphone|ipad/i.test(platform) ? '⌘K' : 'Ctrl K');
  }, []);
  return label;
}

function Mark({ text, query }: { text: string; query: string }) {
  const [a, m, b] = splitMatch(text, query);
  return <>{a}{m && <mark>{m}</mark>}{b}</>;
}

export default function SearchPalette({ trips, open, onClose, onPick, onPeek }: Props) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => {
    const all = searchTrips(trips, query);
    return query.trim() ? all : all.slice(0, 6);
  }, [trips, query]);
  const current = hits[Math.min(sel, hits.length - 1)];

  // Start over each time it opens, even if it's still fading out from the last time
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setSel(0);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [open]);

  // turn the globe toward whatever is highlighted, and let it go on turning once this closes
  const peek = useEffectEvent(onPeek);
  const highlighted = open ? current?.trip : undefined;
  useEffect(() => {
    if (!open) return;
    peek(highlighted ?? null);
    return () => peek(null);
  }, [open, highlighted]);

  const pick = (i: number) => {
    const h = hits[i];
    if (h) onPick(h.trip, h.stopIndex ?? 0);
  };

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { setSel((s) => Math.min(s + 1, hits.length - 1)); e.preventDefault(); }
    if (e.key === 'ArrowUp') { setSel((s) => Math.max(s - 1, 0)); e.preventDefault(); }
    if (e.key === 'Enter') pick(sel);
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence>
        {open && (
          <>
            <m.div key="bg" className="palette-bg" onClick={onClose}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <m.div key="palette" className="palette" role="dialog" aria-modal="true" aria-label="Search trips"
              initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.2, 0.75, 0.15, 1] }}>
              <div className="q">
                <Icon name="search" />
                <input ref={inputRef} type="search" value={query} onKeyDown={onKeyDown} enterKeyHint="go" autoComplete="off"
                  onChange={(e) => { setQuery(e.target.value); setSel(0); }}
                  placeholder="A place, a country, a year…" aria-label="Search trips"
                  role="combobox" aria-expanded="true" aria-controls="palette-results"
                  aria-activedescendant={current ? `hit-${current.trip.id}` : undefined} />
                <button className="q-close" onClick={onClose} aria-label="Close search"><Icon name="x" /></button>
              </div>
              <div className="res" id="palette-results" role="listbox">
                {!query.trim() && <h4>Recent trips</h4>}
                {hits.length === 0 && <p className="empty hand">Nowhere called “{query}” yet… maybe next year?</p>}
                {hits.map((h, i) => {
                  const stop = h.stopIndex === null ? null : h.trip.stops[h.stopIndex];
                  return (
                    <button key={h.trip.id} id={`hit-${h.trip.id}`} role="option" aria-selected={i === sel}
                      className={`row${i === sel ? ' is-sel' : ''}`} style={{ '--tint': h.trip.tint } as CSSProperties}
                      onMouseMove={() => i !== sel && setSel(i)} onClick={() => pick(i)}>
                      <img src={stop?.photos[0]?.thumb ?? h.trip.cover.thumb} alt="" loading="lazy" />
                      <span>
                        <b><Mark text={stop?.name ?? h.trip.title} query={query} /></b>
                        <small>
                          {stop && <>{h.trip.title} · </>}{h.trip.year} · <Mark text={h.trip.countryNames.join(', ')} query={query} />
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="hint">
                <span><kbd>↑</kbd> <kbd>↓</kbd> choose</span>
                <span><kbd>↵</kbd> fly there</span>
                <span><kbd>esc</kbd> close</span>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}

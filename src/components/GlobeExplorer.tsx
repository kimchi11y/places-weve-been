import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createGlobe, type Globe } from '../lib/globe/engine';
import type { Stats, Trip } from '../lib/types';
import { Icon, Sticker } from './icons';
import Journals from './Journals';
import SearchPalette, { useShortcutLabel } from './SearchPalette';
import TripSheet from './TripSheet';

const WIDE = 960;
const WORDS = [['been', '#D23F2B'], ['wandered', '#2A7A4B'], ['got lost', '#7A3FA3'], ['loved', '#C22A66']] as const;

interface Props {
  trips: Trip[];
  stats: Stats;
  canEdit: boolean;
}

/** The trip a URL asks for: every open trip has its own address, so the Back button just works. */
const tripInUrl = (trips: Trip[]) => {
  const id = new URLSearchParams(location.search).get('trip');
  return trips.find((t) => t.id === id) ?? null;
};

export default function GlobeExplorer({ trips, stats, canEdit }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pinsRef = useRef<HTMLDivElement>(null);
  const discRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const shelfRef = useRef<HTMLElement>(null);
  const globeRef = useRef<Globe | null>(null);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [stop, setStop] = useState(0);
  const [picker, setPicker] = useState<Trip[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [spun, setSpun] = useState(false);
  const [word, setWord] = useState(0);
  const [onShelf, setOnShelf] = useState(false);
  const shortcut = useShortcutLabel();
  const sheetOpen = !!trip || !!picker;

  /** Show what the URL says. Runs on load and whenever Back or Forward changes it. */
  function followUrl() {
    const t = tripInUrl(trips);
    setPicker(null);
    setTrip(t);
    if (t) {
      const at = history.state?.stop ?? 0;
      setStop(at);
      scrollTo(0, 0);
      globeRef.current?.focus(t, at);
    } else {
      setStop(0);
      globeRef.current?.reset();
    }
  }

  function open(t: Trip, stopIndex = 0) {
    setSearching(false);
    setPicker(null);
    if (t === trip) return showStop(stopIndex);
    history.pushState({ opened: true, stop: stopIndex }, '', `/?trip=${encodeURIComponent(t.id)}`);
    followUrl();
  }

  function close() {
    if (picker) {
      setPicker(null);
      globeRef.current?.hold(false);
    } else if (history.state?.opened) {
      history.back();
    } else {
      // arrived straight on this trip's address, so there's nothing to go back to
      history.replaceState(null, '', '/');
      followUrl();
    }
  }

  function showStop(i: number) {
    if (!trip) return;
    setStop(i);
    globeRef.current?.focus(trip, i);
  }

  const peek = (t: Trip | null) => {
    if (!t) {
      globeRef.current?.unpeek();
      if (picker) globeRef.current?.hold(true);
    } else if (innerWidth >= WIDE && scrollY <= innerHeight / 2) globeRef.current?.peek(t);
  };

  const goToShelf = () => shelfRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

  // the globe's callbacks outlive any one render
  const onSelect = useEffectEvent(open);

  useEffect(() => {
    const wide = () => innerWidth >= WIDE;
    const globe = createGlobe({
      wrap: wrapRef.current!,
      svg: svgRef.current!,
      pins: pinsRef.current!,
      disc: discRef.current!,
      trips,
      radius: (w, h) => (wide() ? Math.min(w * 0.265, h * 0.43) : Math.min(w * 0.74, h * 0.36)),
      homeLayout: (_w, h, r) => {
        if (wide()) return { tx: 0.72, ty: 0.53 };
        const top = copyRef.current!.getBoundingClientRect().bottom - wrapRef.current!.getBoundingClientRect().top + 22;
        return { tx: 0.5, ty: (top + r) / h };
      },
      focusLayout: () => (wide() ? { tx: 0.34, ty: 0.52 } : { tx: 0.5, ty: 0.19 }),
      focusRoom: (w, h) => (wide() ? { span: Math.min(w, h) * 0.5, right: w - 480 } : { span: Math.min(w * 0.62, h * 0.22), right: w }),
      onSelect: (t, i) => onSelect(t, i),
      onCluster: (ts) => {
        globeRef.current?.hold(true);
        setPicker(ts);
      },
      onSpin: () => setSpun(true),
    });
    globeRef.current = globe;
    document.fonts?.ready.then(() => globe.resize());
    followUrl();
    addEventListener('popstate', followUrl);
    return () => {
      removeEventListener('popstate', followUrl);
      globe.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.classList.toggle('sheet-open', sheetOpen);
    document.body.classList.toggle('search-open', searching);
    document.documentElement.classList.toggle('locked', sheetOpen || searching);
  }, [sheetOpen, searching]);

  // The italic word in the headline changes every few seconds, only while it's on screen
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => {
      if (document.hidden || scrollY > innerHeight * 0.6 || document.body.classList.contains('sheet-open')) return;
      setWord((w) => (w + 1) % WORDS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // The bottom bar shows which part of the page you're on
  useEffect(() => {
    const seen = new IntersectionObserver(([e]) => setOnShelf(e.isIntersecting), { rootMargin: '-55% 0px -40% 0px' });
    seen.observe(shelfRef.current!);
    return () => seen.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.matches('input, textarea');
      // ⌘K on Mac, Ctrl+K on Windows/Linux, or "/" anywhere outside a text field
      if ((e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearching(true);
        return;
      }
      if (e.key === 'Escape') {
        if (searching) setSearching(false);
        else if (sheetOpen) close();
        return;
      }
      if (typing || searching || !trip) return;
      if (e.key === 'ArrowRight') showStop((stop + 1) % trip.stops.length);
      if (e.key === 'ArrowLeft') showStop((stop - 1 + trip.stops.length) % trip.stops.length);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const tally = useMemo(() => [[stats.trips, 'trips'], [stats.countries, 'countries'], [stats.days, 'days']] as const, [stats]);

  return (
    <>
      <main id="home" className={spun ? 'spun' : ''}>
        <section className="hero" aria-label="The globe">
          <div className="hero-copy" ref={copyRef}>
            <h1 aria-label="Places we’ve been">
              <span aria-hidden="true">Places we’ve</span>
              <span className="l2" aria-hidden="true">
                <em key={word} className={`i word${word ? ' swap' : ''}`} style={{ '--t': WORDS[word][1] } as CSSProperties}>{WORDS[word][0]}</em>{' '}
                <svg className="spark" viewBox="0 0 40 40" style={{ '--t': WORDS[word][1] } as CSSProperties}><path d="M6 20 14 6M18 28 34 13M24 36l13-3" /></svg>
              </span>
            </h1>
            <p className="tally">
              {tally.map(([n, label]) => <span key={label}><b>{n}</b> {label}</span>)}
            </p>
            <a className="ghost hero-more" href="#journals" onClick={(e) => { e.preventDefault(); goToShelf(); }}>
              <Icon name="book" /> Browse the journals
            </a>
            <div className="spin-hint hand" aria-hidden="true">
              give it a spin!
              <svg viewBox="0 0 44 30"><path d="M3 3c2 14 16 22 34 20M30 16l8 7-9 6" /></svg>
            </div>
          </div>
          <div id="globeWrap" ref={wrapRef}>
            <div id="disc" ref={discRef} />
            <svg id="globe" ref={svgRef} role="img" aria-label="Globe showing the countries we have visited. The journals below list every trip.">
              <defs>
                <radialGradient id="oceanGrad" cx="36%" cy="28%" r="80%"><stop offset="0" stopColor="#D9F1FA" /><stop offset=".6" stopColor="#BDE3F4" /><stop offset="1" stopColor="#94CDE9" /></radialGradient>
                <radialGradient id="shadeGrad" cx="36%" cy="28%" r="78%"><stop offset=".62" stopColor="#3A6E96" stopOpacity="0" /><stop offset="1" stopColor="#3A5E86" stopOpacity=".28" /></radialGradient>
              </defs>
            </svg>
            <div id="pins" ref={pinsRef} />
          </div>
          <div className="floater f-plane" aria-hidden="true">
            <svg viewBox="0 0 170 80" width="100%"><path d="M4 74C30 50 42 76 62 56 76 42 58 26 48 40c-8 12 22 22 56 2 18-10 30-20 42-30" /></svg>
            <Sticker name="plane" />
          </div>
          <div className="floater f-sun" aria-hidden="true"><Sticker name="sun" /></div>
        </section>
        <Journals ref={shelfRef} trips={trips} canEdit={canEdit} />
      </main>

      <nav className="tabs" aria-label="Main">
        <a href="/" className={onShelf ? '' : 'on'} onClick={(e) => { e.preventDefault(); scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }}>
          <Icon name="globe" /><span>Globe</span>
        </a>
        <a href="#journals" className={onShelf ? 'on' : ''} onClick={(e) => { e.preventDefault(); goToShelf(); }}>
          <Icon name="book" /><span>Journals</span>
        </a>
        <button onClick={() => setSearching(true)} aria-haspopup="dialog">
          <Icon name="search" /><span>Search</span>{shortcut && <kbd>{shortcut}</kbd>}
        </button>
      </nav>

      <TripSheet trip={trip} stop={stop} picker={picker} onStop={showStop} onPick={open} onClose={close} />
      <SearchPalette trips={trips} open={searching} onClose={() => setSearching(false)} onPick={open} onPeek={peek} />
    </>
  );
}


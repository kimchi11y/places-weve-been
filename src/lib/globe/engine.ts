/*
 * Globe engine: a d3-geo orthographic globe rendered to SVG, so every visual is styled from CSS.
 * Framework-agnostic; the React island (GlobeExplorer) drives it.
 *
 * Map detail is tiered: the light 110m map while spinning, the sharper 50m map once zoomed in,
 * and the finest 10m outlines (visited countries only, loaded only for close-ups like Jeju).
 * Trips are photo pins in an HTML layer on top; pins that would overlap merge into one ("3 trips").
 */
import * as d3 from 'd3';
import { feature, mesh } from 'topojson-client';
import world110Url from 'world-atlas/countries-110m.json?url';
import world50Url from 'world-atlas/countries-50m.json?url';
import world10Url from 'world-atlas/countries-10m.json?url';
import type { Coord, Trip } from '../types';

export interface Layout { tx: number; ty: number }

export interface GlobeOptions {
  /** the element that receives drags and sets the globe's size */
  wrap: HTMLElement;
  svg: SVGSVGElement;
  /** empty layer the photo pins go in */
  pins: HTMLElement;
  /** soft paper shadow under the globe */
  disc: HTMLElement;
  trips: Trip[];
  startRotation?: [number, number];
  maxZoom?: number;
  /** globe radius in pixels */
  radius: (w: number, h: number) => number;
  homeLayout: (w: number, h: number, radius: number) => Layout;
  focusLayout: (w: number, h: number) => Layout;
  /** how much of the width a focused trip may use, so nothing hides under the open panel */
  focusRoom: (w: number, h: number) => { span: number; right: number };
  onSelect: (trip: Trip, stopIndex: number) => void;
  onCluster: (trips: Trip[]) => void;
  /** the first time someone spins the globe */
  onSpin?: () => void;
}

export interface Globe {
  focus(trip: Trip, stopIndex?: number): void;
  reset(): void;
  peek(trip: Trip): void;
  unpeek(): void;
  /** pause auto-rotation, e.g. while the "which trip?" picker is open */
  hold(on: boolean): void;
  resize(): void;
  destroy(): void;
}

const HIGH_DETAIL_ZOOM = 1.8;
const FINE_DETAIL_ZOOM = 3.2;
const PIN_HIDDEN = 1.36; // radians from centre before a pin counts as "behind" the globe
const STOP_HIDDEN = 1.45;
const PIN_MERGE = 62; // pins closer than this many pixels become one
const SPIN = 3.5; // degrees per second

type GeoSel = d3.Selection<SVGPathElement, GeoJSON.Feature, SVGGElement, unknown>;
interface Tier { land: GeoJSON.GeoJSON; borders: GeoJSON.GeoJSON; visited: GeoJSON.Feature[] }
type Side = [anchor: 'start' | 'end' | 'middle', x: number, y: number];

const LABEL_SIDES: Side[] = [['start', 14, 5], ['end', -14, 5], ['middle', 0, -16], ['middle', 0, 26], ['start', 12, 22], ['end', -12, -12]];
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const centroid = (t: Trip): Coord => [d3.mean(t.stops, (s) => s.coord[0])!, d3.mean(t.stops, (s) => s.coord[1])!];

export function createGlobe(o: GlobeOptions): Globe {
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const svg = d3.select(o.svg);
  const trips = o.trips;

  // Newest trip wins a country visited more than once
  const inkOf = new Map<string, string>();
  [...trips].reverse().forEach((t) => t.countryIds.forEach((id) => inkOf.set(id, t.ink)));

  const projection = d3.geoOrthographic().clipAngle(90).precision(0.6);
  const path = d3.geoPath(projection);
  const state = { rot: [...(o.startRotation ?? [-42, -30]), 0] as [number, number, number], k: 1, tx: 0.5, ty: 0.5 };
  let w = 0, h = 0, base = 200;
  let focused: Trip | null = null, current = 0;
  let flight: ((t: number) => void) | null = null, held = false, inView = true, dirty = true, velocity = 0, spun = false;
  let drag: { x: number; y: number; t: number; id: number; type: string; moved: boolean } | null = null;
  let frame = 0, last = 0;

  const root = svg.append('g');
  const ocean = root.append('path').attr('class', 'g-ocean').datum({ type: 'Sphere' } as d3.GeoPermissibleObjects);
  const grat = root.append('path').attr('class', 'g-grat').datum(d3.geoGraticule10());
  const land = root.append('path').attr('class', 'g-land');
  const visitedG = root.append('g');
  const fineG = root.append('g').style('display', 'none');
  const borders = root.append('path').attr('class', 'g-border');
  const shade = root.append('path').attr('class', 'g-shade').datum({ type: 'Sphere' } as d3.GeoPermissibleObjects);
  const rim = root.append('path').attr('class', 'g-rim').datum({ type: 'Sphere' } as d3.GeoPermissibleObjects);
  const route = root.append('path').attr('class', 'g-route');
  const stopsG = root.append('g');

  const tiers: { low?: Tier; high?: Tier } = {};
  let tier: 'low' | 'high' | null = null;
  let visitedSel: GeoSel | null = null, fineSel: GeoSel | null = null, fineAsked = false;

  async function loadTier(url: string): Promise<Tier> {
    const world: any = await d3.json(url);
    return {
      land: feature(world, world.objects.land) as GeoJSON.GeoJSON,
      borders: mesh(world, world.objects.countries, (a: unknown, b: unknown) => a !== b),
      visited: ((feature(world, world.objects.countries) as any).features as GeoJSON.Feature[]).filter((f) => inkOf.has(String(f.id))),
    };
  }

  async function loadFine() {
    if (fineAsked) return;
    fineAsked = true;
    const world: any = await d3.json(world10Url);
    const features = ((feature(world, world.objects.countries) as any).features as GeoJSON.Feature[]).filter((f) => inkOf.has(String(f.id)));
    fineSel = fineG.selectAll<SVGPathElement, GeoJSON.Feature>('path').data(features).join('path')
      .attr('class', 'g-visited').attr('fill', (d) => inkOf.get(String(d.id))!);
    mark();
  }

  function setTier(name: 'low' | 'high') {
    const t = tiers[name];
    if (tier === name || !t) return;
    tier = name;
    land.datum(t.land as d3.GeoPermissibleObjects);
    borders.datum(t.borders as d3.GeoPermissibleObjects);
    visitedSel = visitedG.selectAll<SVGPathElement, GeoJSON.Feature>('path').data(t.visited, (d) => String(d.id)).join('path')
      .attr('class', 'g-visited').attr('fill', (d) => inkOf.get(String(d.id))!);
    mark();
  }

  loadTier(world110Url).then((t) => {
    tiers.low = t;
    setTier('low');
    resize();
    o.svg.classList.add('is-ready');
    // the sharper map loads quietly once the globe is already spinning
    setTimeout(() => loadTier(world50Url).then((high) => { tiers.high = high; dirty = true; }), 1200);
  });

  // ---- photo pins ----
  interface Pin { el: HTMLButtonElement; label: HTMLElement; trip: Trip; c: Coord; group: Trip[] }
  const pins: Pin[] = trips.map((trip, i) => {
    const el = document.createElement('button');
    el.className = 'pin';
    el.style.cssText = `--t:${trip.ink};--r:${[-4, 3, -2, 4, -3, 2][i % 6]}deg`;
    const inner = document.createElement('span'), photo = document.createElement('span'), img = document.createElement('img'), label = document.createElement('span');
    inner.className = 'pin-in'; photo.className = 'pin-photo'; label.className = 'pin-label';
    img.src = trip.cover.thumb; img.alt = ''; img.draggable = false;
    photo.append(img); inner.append(photo, label); el.append(inner);
    o.pins.append(el);
    const pin: Pin = { el, label, trip, c: centroid(trip), group: [trip] };
    el.addEventListener('click', () => {
      if (pin.group.length > 1) o.onCluster(pin.group);
      else o.onSelect(trip, 0);
    });
    return pin;
  });

  function placePins() {
    const c: Coord = [-state.rot[0], -state.rot[1]];
    const shown: { x: number; y: number; pin: Pin }[] = [];
    for (const pin of pins) {
      const dist = d3.geoDistance(pin.c, c);
      const back = dist > PIN_HIDDEN;
      pin.el.classList.toggle('is-back', back);
      if (back) continue;
      const p = projection(pin.c)!;
      pin.el.style.transform = `translate(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px) scale(${(0.72 + 0.28 * Math.cos(dist)).toFixed(3)})`;
      pin.group = [pin.trip];
      const near = shown.find((b) => Math.hypot(b.x - p[0], b.y - p[1]) < PIN_MERGE);
      pin.el.classList.toggle('is-merged', !!near);
      if (near) near.pin.group.push(pin.trip);
      else shown.push({ x: p[0], y: p[1], pin });
    }
    for (const { pin } of shown) {
      const many = pin.group.length > 1;
      pin.el.classList.toggle('is-cluster', many);
      const text = many ? `${pin.group.length} trips` : pin.trip.title;
      if (pin.label.textContent !== text) pin.label.textContent = text;
      pin.el.setAttribute('aria-label', many ? `${pin.group.length} trips: ${pin.group.map((t) => t.title).join(', ')}` : `Open ${pin.trip.title}`);
    }
  }

  // ---- the focused trip's stops ----
  function placeStops() {
    if (!focused) return;
    const c: Coord = [-state.rot[0], -state.rot[1]];
    const pts = focused.stops.map((s) => (d3.geoDistance(s.coord, c) < STOP_HIDDEN ? projection(s.coord) : null));
    const limit = o.focusRoom(w, h).right;
    const taken = pts.flatMap((p) => (p ? [{ x0: p[0] - 9, x1: p[0] + 9, y0: p[1] - 9, y1: p[1] + 9, own: p as [number, number] | null }] : []));
    stopsG.selectAll<SVGGElement, Trip['stops'][number] & { side?: Side }>('g').each(function (s, i) {
      const p = pts[i];
      this.style.display = p ? '' : 'none';
      if (!p) return;
      this.setAttribute('transform', `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})`);
      // Each label takes the first side that stays on screen and clear of other stops and labels
      const text = this.lastChild as SVGTextElement, tw = text.getComputedTextLength() || 60;
      const boxOf = ([anchor, x, y]: Side) => {
        const x0 = p[0] + x - (anchor === 'end' ? tw : anchor === 'middle' ? tw / 2 : 0);
        return { x0, x1: x0 + tw, y0: p[1] + y - 13, y1: p[1] + y + 4, own: null };
      };
      const fits = (b: ReturnType<typeof boxOf>) => b.x0 > 6 && b.x1 < limit - 6 && b.y0 > 4
        && !taken.some((t) => t.own !== p && b.x0 < t.x1 && b.x1 > t.x0 && b.y0 < t.y1 && b.y1 > t.y0);
      const side = [...(s.side ? [s.side] : []), ...LABEL_SIDES].find((x) => fits(boxOf(x))) ?? LABEL_SIDES[0];
      s.side = side;
      taken.push(boxOf(side));
      text.setAttribute('text-anchor', side[0]);
      text.setAttribute('x', String(side[1]));
      text.setAttribute('y', String(side[2]));
    });
  }

  function mark() {
    const on = (d: GeoJSON.Feature) => !!focused && focused.countryIds.includes(String(d.id));
    visitedSel?.classed('on', on);
    fineSel?.classed('on', on);
    root.classed('g-focus', !!focused);
    o.wrap.classList.toggle('g-focus-on', !!focused);
    if (focused) o.wrap.style.setProperty('--ft', focused.tint);
    route.attr('stroke', focused?.ink ?? 'none');
    const sel = stopsG.selectAll<SVGGElement, Trip['stops'][number]>('g').data(focused?.stops ?? [], (s) => s.name).join((enter) => {
      const g = enter.append('g').attr('class', 'g-stop').on('click', (_, s) => {
        if (focused) o.onSelect(focused, focused.stops.indexOf(s));
      });
      g.append('circle').attr('class', 'g-hit').attr('r', 22);
      g.append('circle').attr('class', 'g-dot');
      g.append('text').text((s) => s.name);
      return g;
    });
    sel.classed('now', (_, i) => i === current);
    sel.select('.g-dot').attr('fill', focused?.ink ?? null).attr('r', (_, i) => (i === current ? 10 : 6));
    dirty = true;
  }

  function render() {
    projection.scale(base * state.k).translate([w * state.tx, h * state.ty]).rotate(state.rot);
    setTier(tiers.high && state.k >= HIGH_DETAIL_ZOOM ? 'high' : 'low');
    const r = base * state.k;
    // the paper shadow only shows when the whole globe is on screen
    o.disc.hidden = state.k > 1.5;
    if (!o.disc.hidden) {
      o.disc.style.transform = `translate(${w * state.tx - r}px,${h * state.ty - r}px)`;
      o.disc.style.width = o.disc.style.height = `${r * 2}px`;
    }
    const d = path as unknown as string;
    ocean.attr('d', d); grat.attr('d', d); rim.attr('d', d); shade.attr('d', d);
    land.attr('d', d); borders.attr('d', d);
    visitedSel?.attr('d', d);
    // In close-ups the sharp outlines take over and the coarse ones are painted out beneath them
    const fine = !!fineSel && state.k >= FINE_DETAIL_ZOOM;
    visitedG.classed('painted-out', fine);
    fineG.style('display', fine ? '' : 'none');
    if (fine) fineSel!.attr('d', d);
    if (focused) {
      route.attr('d', path({ type: 'LineString', coordinates: focused.stops.map((s) => s.coord) }) ?? '');
      placeStops();
    } else {
      placePins();
    }
  }

  /** Cinematic move: rotate + zoom, with a slight pull-back mid-flight on long hops. */
  function flyTo(to: Layout & { rot: [number, number]; k: number }, dur?: number) {
    const r0 = state.rot.slice(), k0 = state.k, tx0 = state.tx, ty0 = state.ty;
    let lon = to.rot[0];
    while (lon - r0[0] > 180) lon -= 360;
    while (lon - r0[0] < -180) lon += 360;
    const dist = d3.geoDistance([-r0[0], -r0[1]], [-lon, -to.rot[1]]);
    const dip = Math.min(0.5, dist / 2.5);
    const ms = calm ? 1 : dur ?? 1000 + dist * 500;
    const t0 = performance.now();
    flight = (t) => {
      const p = d3.easeCubicInOut(clamp((t - t0) / ms));
      state.rot = [r0[0] + (lon - r0[0]) * p, r0[1] + (to.rot[1] - r0[1]) * p, 0];
      state.k = k0 * Math.pow(to.k / k0, p) * (1 - dip * Math.sin(Math.PI * p));
      state.tx = tx0 + (to.tx - tx0) * p;
      state.ty = ty0 + (to.ty - ty0) * p;
      if (p >= 1) flight = null;
    };
  }

  function tripZoom(t: Trip) {
    let d = 0;
    for (const a of t.stops) for (const b of t.stops) d = Math.max(d, d3.geoDistance(a.coord, b.coord));
    return clamp(o.focusRoom(w, h).span / (Math.max(d, 0.02) * base), 1.5, o.maxZoom ?? 60);
  }

  function resize() {
    w = o.wrap.clientWidth; h = o.wrap.clientHeight;
    if (!w || !h) return;
    base = o.radius(w, h);
    svg.attr('viewBox', `0 0 ${w} ${h}`);
    if (!flight) Object.assign(state, focused ? o.focusLayout(w, h) : o.homeLayout(w, h, base));
    dirty = true;
  }

  function tick(t: number) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(64, t - last) / 1000; last = t;
    if (!inView || !w) return;
    if (flight) { flight(t); dirty = true; }
    else if (!focused && !drag && !held) {
      if (Math.abs(velocity) > 0.4) { state.rot[0] += velocity * dt; velocity *= 0.95; dirty = true; }
      else if (!calm) { state.rot[0] += SPIN * dt; dirty = true; }
    }
    if (dirty) { dirty = false; render(); }
  }

  // A drag that ends on a pin shouldn't also open it
  let swallow = false;
  // Dragging: on touch only sideways turns the globe, so a vertical swipe still scrolls the page.
  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, type: e.pointerType, moved: false };
    flight = null; velocity = 0; swallow = false;
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; o.wrap.classList.add('is-drag'); }
    if (!drag.moved) return;
    const f = 0.3 / state.k;
    state.rot[0] += dx * f;
    if (drag.type === 'mouse') state.rot[1] = clamp(state.rot[1] - dy * f, -70, 70);
    velocity = (dx * f) / Math.max(0.008, (e.timeStamp - drag.t) / 1000);
    drag.x = e.clientX; drag.y = e.clientY; drag.t = e.timeStamp;
    dirty = true;
    if (!spun) { spun = true; o.onSpin?.(); }
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    o.wrap.classList.remove('is-drag');
    if (e.timeStamp - drag.t > 90) velocity = 0;
    velocity = clamp(velocity, -120, 120);
    drag = null;
  };
  const onClickCapture = (e: MouseEvent) => { if (swallow) { e.stopPropagation(); swallow = false; } };
  const onUpCapture = (e: PointerEvent) => { swallow = !!drag && e.pointerId === drag.id && drag.moved; };

  o.wrap.addEventListener('pointerdown', onDown);
  o.wrap.addEventListener('click', onClickCapture, true);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUpCapture, true);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  addEventListener('resize', resize);
  // No point drawing a globe that's been scrolled away
  const seen = new IntersectionObserver(([e]) => { inView = e.isIntersecting; });
  seen.observe(o.wrap);

  resize();
  frame = requestAnimationFrame(tick);

  return {
    focus(trip, i = 0) {
      focused = trip; current = i; held = false; velocity = 0;
      mark();
      const k = tripZoom(trip);
      if (k >= FINE_DETAIL_ZOOM) loadFine();
      // Lean towards the current stop, but keep tiny trips centred so all their stops stay in view
      const s = trip.stops[i].coord, c = centroid(trip);
      const at: Coord = k > 8 ? c : [s[0] * 0.55 + c[0] * 0.45, s[1] * 0.55 + c[1] * 0.45];
      flyTo({ rot: [-at[0], -at[1]], k, ...o.focusLayout(w, h) });
    },
    reset() {
      if (!focused) return;
      focused = null; mark();
      flyTo({ rot: [state.rot[0], -26], k: 1, ...o.homeLayout(w, h, base) }, 1200);
    },
    peek(trip) {
      if (focused) return;
      held = true;
      const c = centroid(trip);
      flyTo({ rot: [-c[0], -c[1] + 6], k: 1, ...o.homeLayout(w, h, base) }, 1100);
    },
    unpeek() { held = false; },
    hold(on) { held = on; },
    resize,
    destroy() {
      cancelAnimationFrame(frame);
      seen.disconnect();
      o.wrap.removeEventListener('pointerdown', onDown);
      o.wrap.removeEventListener('click', onClickCapture, true);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUpCapture, true);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onUp);
      removeEventListener('resize', resize);
      root.remove();
      o.pins.replaceChildren();
    },
  };
}

/*
 * The route card: a trip's stops on a real map, stickers nudged apart so none overlap,
 * and a plane that flies the dotted line as you scroll.
 */
import { geoMercator, geoPath, json, type GeoPermissibleObjects } from 'd3';
import { feature } from 'topojson-client';
import world50Url from 'world-atlas/countries-50m.json?url';
import world10Url from 'world-atlas/countries-10m.json?url';

export interface RouteData {
  countries: string[];
  stops: { name: string; lng: number; lat: number; thumb?: string }[];
}

const SVG = 'http://www.w3.org/2000/svg';
const STICKER_W = 96, STICKER_H = 82;
const SMALL_TRIP = 3; // degrees: a trip this tight needs the sharpest outlines
const ONE_STOP = 3; // degrees of longitude to show around a trip with a single place
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** A map projection that shows every stop, clear of the card's edges. */
export function fitRoute(pts: [lng: number, lat: number][], W: number, H: number) {
  const projection = geoMercator();
  // One place has no extent to fit: the zoom would be infinite
  if (pts.every((p) => p[0] === pts[0][0] && p[1] === pts[0][1])) {
    return projection.center(pts[0]).translate([W / 2, H / 2]).scale(W / ((ONE_STOP * Math.PI) / 180));
  }
  const padX = Math.min(90, W * 0.2), padY = 92;
  return projection.fitExtent([[padX, padY], [W - padX, H - padY]], { type: 'MultiPoint', coordinates: pts });
}

/** Draws into `box`; returns a function that moves the plane, in stops (0 → the last stop). */
export function buildRouteMap(box: HTMLElement, route: RouteData) {
  box.replaceChildren();
  const W = box.clientWidth, H = box.clientHeight;
  const pts = route.stops.map((s): [number, number] => [s.lng, s.lat]);
  const projection = fitRoute(pts, W, H);
  const path = geoPath(projection);
  const xy = pts.map((p) => projection(p)!);

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('aria-hidden', 'true');
  box.append(svg);
  const add = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element = svg) => {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    parent.append(el);
    return el;
  };

  // The map goes underneath and arrives when it's ready; the route already works without it.
  const land = add('g', {});
  const paint = (cls: string, shape: GeoPermissibleObjects) => add('path', { class: cls, d: path(shape) ?? '' }, land);
  const ids = new Set(route.countries);
  const countriesOf = (world: any) => ((feature(world, world.objects.countries) as any).features as GeoJSON.Feature[]).filter((f) => ids.has(String(f.id)));
  json<any>(world50Url).then((world) => {
    paint('m-far', feature(world, world.objects.land) as GeoPermissibleObjects);
    countriesOf(world).forEach((f) => paint('m-here', f));
    const spread = Math.max(Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])));
    if (spread >= SMALL_TRIP) return;
    json<any>(world10Url).then((fine) => {
      // the coarse outlines are painted out so they don't show around the sharp ones
      countriesOf(world).forEach((f) => paint('m-out', f));
      countriesOf(fine).forEach((f) => paint('m-here', f));
    });
  }).catch(() => {});

  // Gentle bends, alternating sides, so short hops still read as flights
  const segs = xy.slice(1).map((b, i) => {
    const a = xy[i], dx = b[0] - a[0], dy = b[1] - a[1], f = i % 2 ? -0.2 : 0.2;
    return `Q${(a[0] + b[0]) / 2 - dy * f} ${(a[1] + b[1]) / 2 + dx * f} ${b[0]} ${b[1]}`;
  });
  const d = `M${xy[0][0]} ${xy[0][1]}${segs.join('')}`;
  const base = add('path', { class: 'm-base', d });
  const total = base.getTotalLength();
  const mask = add('mask', { id: 'route-mask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H });
  const reveal = add('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': 10, 'stroke-dasharray': total, 'stroke-dashoffset': total }, mask);
  add('path', { class: 'm-done', d, mask: 'url(#route-mask)' });

  // where along the line each stop sits
  const at = [0];
  segs.reduce((sum, seg, i) => {
    const part = document.createElementNS(SVG, 'path');
    part.setAttribute('d', `M${xy[i][0]} ${xy[i][1]}${seg}`);
    const next = sum + part.getTotalLength();
    at.push(next);
    return next;
  }, 0);

  // Stickers stand above their stop; nudge them until none overlap, staying inside the card
  const spots = xy.map((p) => ({ x: p[0], y: p[1] - 52 }));
  for (let round = 0; round < 120; round++) {
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const a = spots[i], b = spots[j];
        const ox = STICKER_W - Math.abs(a.x - b.x), oy = STICKER_H - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        if (oy * 1.1 < ox) { const s = a.y <= b.y ? -1 : 1; a.y += s * (oy / 2 + 1); b.y -= s * (oy / 2 + 1); }
        else { const s = a.x <= b.x ? -1 : 1; a.x += s * (ox / 2 + 1); b.x -= s * (ox / 2 + 1); }
      }
      const a = spots[i];
      a.x = clamp(a.x, STICKER_W / 2 + 8, W - STICKER_W / 2 - 8);
      a.y = clamp(a.y, STICKER_H / 2 + 6, H - STICKER_H / 2 - 22);
    }
  }

  const dots = xy.map((p, i) => {
    const s = spots[i];
    if (Math.hypot(s.x - p[0], s.y + 40 - p[1]) > 14) add('line', { class: 'm-lead', x1: p[0], y1: p[1], x2: s.x, y2: s.y + 34 });
    return add('circle', { class: 'm-dot', cx: p[0], cy: p[1], r: 5 });
  });


  const stickers = route.stops.map((s, i) => {
    const el = document.createElement('div');
    el.className = 'mstick';
    el.style.left = `${spots[i].x}px`;
    el.style.top = `${spots[i].y}px`;
    if (s.thumb) {
      const ph = document.createElement('span'), img = document.createElement('img');
      ph.className = 'ph';
      img.src = s.thumb; img.alt = ''; img.loading = 'lazy';
      ph.append(img);
      el.append(ph);
    }
    const name = document.createElement('b');
    name.textContent = s.name;
    el.append(name);
    box.append(el);
    return el;
  });

  // The plane has its own layer so it flies over the stickers, not under them
  const sky = document.createElementNS(SVG, 'svg');
  sky.setAttribute('viewBox', `0 0 ${W} ${H}`);
  sky.setAttribute('aria-hidden', 'true');
  sky.setAttribute('class', 'm-sky');
  box.append(sky);
  const plane = add('g', { class: 'm-plane' }, sky);
  const inner = add('g', { transform: 'translate(-22,-22) scale(.92)' }, plane);
  add('use', { href: '#s-plane', width: 48, height: 48, class: 'cut' }, inner);
  add('use', { href: '#s-plane', width: 48, height: 48 }, inner);

  let last = -1;
  return (p: number) => {
    if (Math.abs(p - last) < 0.002) return;
    last = p;
    const i = Math.min(Math.max(0, at.length - 2), Math.floor(p)), f = p - i;
    const len = at.length > 1 ? at[i] + (at[i + 1] - at[i]) * f : 0;
    reveal.setAttribute('stroke-dashoffset', String(total - len));
    const here = base.getPointAtLength(len);
    const ahead = base.getPointAtLength(Math.min(total, len + 1.5));
    const behind = total && len >= total ? base.getPointAtLength(total - 1.5) : null;
    const angle = behind ? Math.atan2(here.y - behind.y, here.x - behind.x) : Math.atan2(ahead.y - here.y, ahead.x - here.x);
    plane.setAttribute('transform', `translate(${here.x},${here.y}) rotate(${(angle * 180) / Math.PI})`);
    const now = Math.round(p);
    stickers.forEach((el, n) => { el.classList.toggle('on', n <= p + 0.05); el.classList.toggle('now', n === now); });
    dots.forEach((dot, n) => dot.classList.toggle('on', n <= p + 0.05));
  };
}

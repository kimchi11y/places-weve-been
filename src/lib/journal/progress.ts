/*
 * Where you are in the journal: the route bar on phones, the plane on the map, the stops
 * landing as you reach them, and the Back link.
 */
import { buildRouteMap, type RouteData } from './route-map';

const WIDE = 960;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Native smooth scrolling can stop short while lazy photos load, so this re-aims every frame. Touching the page cancels it. */
function jumpTo(el: HTMLElement) {
  const gap = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const aim = () => el.getBoundingClientRect().top + scrollY - gap;
  if (calm()) return scrollTo(0, aim());
  const from = scrollY, t0 = performance.now(), dur = clamp(Math.abs(aim() - from) * 0.4, 350, 950);
  let stopped = false;
  const stop = () => { stopped = true; };
  addEventListener('wheel', stop, { once: true, passive: true });
  addEventListener('touchstart', stop, { once: true, passive: true });
  requestAnimationFrame(function step(t) {
    if (stopped) return;
    const p = ease(clamp((t - t0) / dur));
    scrollTo(0, from + (aim() - from) * p);
    if (p < 1) return requestAnimationFrame(step);
    removeEventListener('wheel', stop);
    removeEventListener('touchstart', stop);
  });
}

export function startProgress(article: HTMLElement) {
  const pages = [...article.querySelectorAll<HTMLElement>('.page')];
  const links = [...article.querySelectorAll<HTMLAnchorElement>('.ribbon a[data-stop]')];
  const scroller = article.querySelector<HTMLElement>('.rb-scroll')!;
  const plane = article.querySelector<HTMLElement>('.rb-plane')!;
  const done = article.querySelector<HTMLElement>('.rb-done')!;
  const track = article.querySelector<HTMLElement>('.rb-track')!;
  const card = article.querySelector<HTMLElement>('.routecard')!;
  const mapBox = article.querySelector<HTMLElement>('.map')!;
  const route = JSON.parse(mapBox.dataset.route!) as RouteData;
  let moveMapPlane = buildRouteMap(mapBox, route);
  let x0 = 0, x1 = 0, settle = 0;

  function placeRibbon() {
    const first = links[0], last = links.at(-1)!;
    if (!first.offsetWidth) return;
    x0 = first.offsetLeft + first.offsetWidth / 2;
    x1 = last.offsetLeft + last.offsetWidth / 2;
    track.style.left = done.style.left = `${x0}px`;
    track.style.width = `${x1 - x0}px`;
  }

  function onScroll() {
    const vh = innerHeight, line = vh * 0.42, n = pages.length;
    // 0 → n-1: how far through the stops the reading line is
    let p = 0;
    const tops = pages.map((el) => el.getBoundingClientRect().top);
    for (let i = 0; i < n; i++) {
      if (tops[i] > line) continue;
      const nextTop = i + 1 < n ? tops[i + 1] : tops[i] + pages[i].offsetHeight;
      p = i + clamp((line - tops[i]) / Math.max(1, nextTop - tops[i]));
    }
    p = clamp(p, 0, n - 1);

    if (innerWidth >= WIDE) moveMapPlane(p);
    else {
      // on a phone the map scrolls past, so the plane flies the whole route as the card rises up the screen
      const r = card.getBoundingClientRect();
      const from = vh - r.height * 0.7, to = 70;
      moveMapPlane(clamp((from - r.top) / (from - to)) * (n - 1));
    }

    const now = Math.round(p);
    links.forEach((a, i) => {
      a.classList.toggle('past', i < p);
      a.classList.toggle('now', i === now);
      if (i === now) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    if (n > 1) {
      const x = x0 + (x1 - x0) * (p / (n - 1));
      plane.style.left = `${x}px`;
      done.style.width = `${x - x0}px`;
    }
    // Keep the current stop visible on a long route, once the page has settled
    clearTimeout(settle);
    settle = window.setTimeout(() => {
      if (scroller.scrollWidth <= scroller.clientWidth) return;
      const a = links[now];
      scroller.scrollTo({ left: a.offsetLeft - scroller.clientWidth / 2 + a.offsetWidth / 2, behavior: calm() ? 'auto' : 'smooth' });
    }, 160);
  }

  links.forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    jumpTo(pages[Number(a.dataset.stop)]);
  }));

  // Back returns to where you were on the globe, if that's where you came from
  article.querySelectorAll<HTMLAnchorElement>('[data-back]').forEach((a) => a.addEventListener('click', (e) => {
    if (!document.referrer) return;
    const from = new URL(document.referrer);
    if (from.origin === location.origin && from.pathname === '/') {
      e.preventDefault();
      history.back();
    }
  }));

  // Photos and postmarks land once as each stop arrives
  if (!calm()) {
    const seen = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      seen.unobserve(e.target);
      setTimeout(() => e.target.classList.add('landed'), 1400);
    }), { threshold: 0.12 });
    pages.forEach((el) => seen.observe(el));
  }

  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; onScroll(); });
  }, { passive: true });

  // Rebuild for a new width; phones change height whenever their address bar slides away
  let lastWidth = innerWidth;
  addEventListener('resize', () => {
    placeRibbon();
    if (innerWidth !== lastWidth) {
      lastWidth = innerWidth;
      moveMapPlane = buildRouteMap(mapBox, route);
    }
    onScroll();
  });

  document.fonts?.ready.then(() => { placeRibbon(); onScroll(); });
  placeRibbon();
  onScroll();
}

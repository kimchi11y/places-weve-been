/*
 * The photo walls. Photos go, in order, into the shortest column so a wall reads left to right.
 * An odd one out becomes a full-width lead photo, and any space left at the bottom of a column
 * is filled by a stamp or a route sketch.
 */
const GAP = 14;
const FRAME = 14; // white print border, top + bottom
const STRETCH_MAX = 120; // smaller gaps are absorbed by cropping a column's last photo taller
const SPLIT_OVER = 440; // taller gaps get two cards instead of one huge one

interface Wall { el: HTMLElement; tiles: HTMLElement[]; stop: HTMLElement }
type Turns = Map<HTMLElement, number>;

const ratioOf = (tile: HTMLElement) => Number(tile.dataset.ratio);

function filler(stop: HTMLElement, height: number, turns: Turns): HTMLElement[] {
  if (height > SPLIT_OVER) {
    const half = (height - GAP) / 2;
    return [...filler(stop, half, turns), ...filler(stop, half, turns)];
  }
  const turn = turns.get(stop) ?? 0;
  turns.set(stop, turn + 1);
  // Short gaps always get a stamp; a trip with one stop has no route to sketch
  const map = height < 160 || turn % 2 ? null : stop.querySelector<HTMLTemplateElement>('template[data-fill="map"]');
  const tpl = map ?? stop.querySelector<HTMLTemplateElement>('template[data-fill="stamp"]')!;
  const card = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
  card.style.height = `${height}px`;
  return [card];
}

function layoutWall({ el, tiles, stop }: Wall, turns: Turns) {
  const width = el.clientWidth;
  if (!width) return;
  const setHeight = (tile: HTMLElement, h: number) => { tile.querySelector('img')!.style.height = `${h}px`; };

  // A single portrait photo stays a sensible size; any other odd one out leads the wall
  let rest = tiles;
  const parts: HTMLElement[] = [];
  const first = tiles[0];
  if (tiles.length === 1 && ratioOf(first) < 1) {
    first.classList.add('solo-tall');
    setHeight(first, (Math.min(width, 340) - FRAME) / ratioOf(first));
    parts.push(first);
    rest = [];
  } else if (tiles.length % 2 === 1 && ratioOf(first) >= 1) {
    setHeight(first, (width - FRAME) / ratioOf(first));
    first.classList.add('lead');
    parts.push(first);
    rest = tiles.slice(1);
  }

  if (rest.length) {
    const cols = Math.max(2, Math.min(4, Math.floor(width / 230)));
    const colW = (width - GAP * (cols - 1)) / cols;
    const heights: number[] = Array(cols).fill(0);
    const buckets: { tile: HTMLElement; h: number }[][] = Array.from({ length: cols }, () => []);
    for (const tile of rest) {
      const h = (colW - FRAME) / ratioOf(tile);
      const c = heights.indexOf(Math.min(...heights));
      buckets[c].push({ tile, h });
      heights[c] += h + FRAME + GAP;
    }
    const max = Math.max(...heights);
    const row = document.createElement('div');
    row.className = 'cols';
    row.append(...buckets.map((bucket, c) => {
      const col = document.createElement('div');
      col.className = 'col';
      const gap = max - heights[c];
      const last = bucket.at(-1);
      let extra: HTMLElement[] = [];
      if (gap >= 1 && last && gap < STRETCH_MAX) last.h += gap;
      else if (gap >= 1) extra = filler(stop, gap - GAP, turns);
      for (const { tile, h } of bucket) {
        setHeight(tile, h);
        col.append(tile);
      }
      col.append(...extra);
      return col;
    }));
    parts.push(row);
  }
  el.classList.add('is-masonry');
  el.replaceChildren(...parts);
}

export function startMasonry(main: HTMLElement) {
  const walls: Wall[] = [...main.querySelectorAll<HTMLElement>('.wall')].map((el) => ({
    el,
    tiles: [...el.querySelectorAll<HTMLElement>('.tile')],
    stop: el.closest<HTMLElement>('.page')!,
  }));
  const layout = () => {
    const turns: Turns = new Map();
    for (const wall of walls) layoutWall(wall, turns);
  };
  layout();
  let lastWidth = main.clientWidth;
  new ResizeObserver(() => {
    if (Math.abs(main.clientWidth - lastWidth) < 1) return;
    lastWidth = main.clientWidth;
    requestAnimationFrame(layout);
  }).observe(main);
}

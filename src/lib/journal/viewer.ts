/*
 * The photo viewer: one sequence through every photo of the trip. It follows your finger:
 * sideways changes photo, down closes. A tap does nothing, so nobody closes it by accident.
 */
export function startViewer(article: HTMLElement) {
  const tiles = [...article.querySelectorAll<HTMLElement>('.tile')].sort((a, b) => Number(a.dataset.i) - Number(b.dataset.i));
  const lb = article.querySelector<HTMLDialogElement>('.lb')!;
  const print = lb.querySelector<HTMLElement>('.lb-print')!;
  const img = print.querySelector('img')!;
  const segments = [...lb.querySelectorAll<HTMLElement>('.lb-track button')];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = 0, opener: HTMLElement | null = null;

  function show(i: number, dir = 0) {
    if (!tiles.length) return;
    cur = (i + tiles.length) % tiles.length;
    const t = tiles[cur];
    img.src = t.dataset.full!;
    new Image().src = tiles[(cur + 1) % tiles.length].dataset.full!;
    img.alt = `${t.dataset.label}, photo ${cur + 1} of ${tiles.length}`;
    lb.querySelector('.lb-where')!.textContent = t.dataset.label!;
    lb.querySelector('.lb-count')!.textContent = `${cur + 1} / ${tiles.length}`;
    const stop = Number(t.dataset.stop);
    segments.forEach((seg, si) => {
      const first = Number(seg.dataset.first);
      const size = Number(seg.style.getPropertyValue('--w'));
      const done = si < stop ? 1 : si > stop ? 0 : (cur - first + 1) / size;
      seg.querySelector('i')!.style.width = `${done * 100}%`;
      seg.classList.toggle('on', si === stop);
    });
    if (dir && !calm) {
      print.style.setProperty('--from', String(dir));
      print.classList.remove('fly');
      void print.offsetWidth;
      print.classList.add('fly');
    }
  }

  tiles.forEach((t) => t.addEventListener('click', () => {
    opener = t;
    show(Number(t.dataset.i));
    lb.showModal();
  }));
  lb.addEventListener('close', () => opener?.focus({ preventScroll: true }));
  lb.querySelector('.lb-x')!.addEventListener('click', () => lb.close());
  lb.querySelector('.prev')!.addEventListener('click', () => show(cur - 1, -1));
  lb.querySelector('.next')!.addEventListener('click', () => show(cur + 1, 1));
  segments.forEach((seg) => seg.addEventListener('click', () => show(Number(seg.dataset.first), 1)));
  lb.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(cur + 1, 1);
    if (e.key === 'ArrowLeft') show(cur - 1, -1);
  });

  const stage = lb.querySelector<HTMLElement>('.lb-stage')!;
  let drag: { x: number; y: number; dx: number; dy: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    stage.setPointerCapture(e.pointerId);
    print.classList.remove('fly');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.dx = e.clientX - drag.x;
    drag.dy = e.clientY - drag.y;
    const down = Math.max(0, drag.dy);
    print.style.transform = Math.abs(drag.dx) > down ? `translateX(${drag.dx}px) rotate(${drag.dx * 0.025}deg)` : `translateY(${down}px) scale(${1 - down / 1400})`;
  });
  const end = () => {
    if (!drag) return;
    const { dx, dy } = drag;
    drag = null;
    print.style.transform = '';
    if (dy > 110 && Math.abs(dx) < dy) lb.close();
    else if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', () => { drag = null; print.style.transform = ''; });
}

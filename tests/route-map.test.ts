import { describe, expect, it } from 'vitest';
import { fitRoute } from '../src/lib/journal/route-map';

const W = 360, H = 400;
const place = (pts: [number, number][], at: [number, number] = pts[0]) => fitRoute(pts, W, H)(at)!;

describe('fitting the route to its card', () => {
  it('puts a single stop in the middle, with some country around it', () => {
    for (const at of [[108.2, 16.05], [0, 0], [-179.9, -54.8], [15.6, 78.2]] as [number, number][]) {
      const [x, y] = place([at]);
      expect(x).toBeCloseTo(W / 2);
      expect(y).toBeCloseTo(H / 2);
      const edge = place([at], [at[0] + 0.5, at[1]]);
      expect(edge[0] - x).toBeGreaterThan(20);
      expect(edge[0] - x).toBeLessThan(W / 2);
    }
  });

  it('does the same for several stops at one place', () => {
    const [x, y] = place([[108.2, 16.05], [108.2, 16.05]]);
    expect([Math.round(x), Math.round(y)]).toEqual([W / 2, H / 2]);
  });

  it('fits several stops inside the margins, even along one line', () => {
    for (const pts of [[[126.5, 33.5], [126.9, 33.2]], [[100, 10], [110, 10]], [[100, 10], [100, 20]]] as [number, number][][]) {
      for (const [x, y] of pts.map((p) => place(pts, p))) {
        expect(x).toBeGreaterThanOrEqual(71.9);
        expect(x).toBeLessThanOrEqual(W - 71.9);
        expect(y).toBeGreaterThanOrEqual(91.9);
        expect(y).toBeLessThanOrEqual(H - 91.9);
      }
    }
  });
});

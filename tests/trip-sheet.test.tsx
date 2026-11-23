// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TripSheet from '../src/components/TripSheet';
import type { Trip } from '../src/lib/types';
import { exampleTrip } from './dom';

const jeju = exampleTrip('jeju', 'Jeju', ['Seogwipo', 'Seongsan']);
const hanoi = exampleTrip('hanoi', 'Hanoi', ['Lake']);
type Shown = { trip?: Trip | null; stop?: number; picker?: Trip[] | null };
function setup(shown: Shown) {
  const on = { onStop: vi.fn(), onPick: vi.fn(), onClose: vi.fn() };
  const ui = ({ trip = null, stop = 0, picker = null }: Shown) => <TripSheet trip={trip} stop={stop} picker={picker} {...on} />;
  const { rerender } = render(ui(shown));
  return { ...on, show: (next: Shown) => rerender(ui(next)), user: userEvent.setup() };
}
const photo = () => document.querySelector('.sh-print img')!.getAttribute('src');
const nextPhoto = () => screen.getByRole('button', { name: /^Next photo/ });
const sheet = () => document.querySelector<HTMLElement>('.sheet')!;

describe('trip sheet', () => {
  it('goes round a stop’s photos', async () => {
    const { user } = setup({ trip: jeju });
    const seen = [photo()];
    for (let i = 0; i < 2; i++) { await user.click(nextPhoto()); seen.push(photo()); }
    expect(seen).toEqual(['/Seogwipo-1/tile', '/Seogwipo-2/tile', '/Seogwipo-1/tile']);
  });

  it('starts each stop and trip at its first photo', async () => {
    const { user, show } = setup({ trip: jeju });
    await user.click(nextPhoto());
    show({ trip: jeju, stop: 1 });
    expect(photo()).toBe('/Seongsan-1/tile');
    await user.click(nextPhoto());
    show({ trip: hanoi, stop: 0 });
    expect(photo()).toBe('/Lake-1/tile');
    show({ trip: jeju, stop: 0 });
    expect(photo()).toBe('/Seogwipo-1/tile');
  });

  it('keeps focus on the photo when the arrow keys change stop', () => {
    const { show } = setup({ trip: jeju });
    nextPhoto().focus();
    show({ trip: jeju, stop: 1 });
    expect(document.activeElement).toBe(nextPhoto());
  });

  it('keeps the trip on screen while it slides away', () => {
    const { show } = setup({ trip: jeju });
    show({});
    expect(sheet().classList.contains('open')).toBe(false);
    expect(sheet().hasAttribute('inert')).toBe(true);
    expect(sheet().textContent).toContain('About Jeju.');
    show({ trip: hanoi });
    expect(sheet().textContent).toContain('About Hanoi.');
  });

  it('takes focus when it opens and gives it back when it closes', () => {
    const opener = document.body.appendChild(document.createElement('button'));
    const { show } = setup({});
    opener.focus();
    show({ trip: jeju });
    expect(document.activeElement).toBe(sheet());
    show({});
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('lets you choose between trips close together', async () => {
    const { user, onPick } = setup({ picker: [jeju, hanoi] });
    await user.click(screen.getByRole('button', { name: /Hanoi/ }));
    expect(onPick).toHaveBeenCalledWith(hanoi);
  });

  it('closes on a long swipe down only', () => {
    const { onClose } = setup({ trip: jeju });
    const grab = document.querySelector<HTMLElement>('.sh-grab')!;
    grab.setPointerCapture = () => {};
    for (const [to, closes] of [[190, 0], [191, 1]]) {
      fireEvent.pointerDown(grab, { clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(grab, { clientY: to, pointerId: 1 });
      fireEvent.pointerUp(grab, { pointerId: 1 });
      expect(onClose).toHaveBeenCalledTimes(closes);
    }
  });
});

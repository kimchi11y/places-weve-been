// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GlobeExplorer from '../src/components/GlobeExplorer';
import type { GlobeOptions } from '../src/lib/globe/engine';
import { exampleTrip } from './dom';

const globe = vi.hoisted(() => ({
  options: null as unknown as GlobeOptions,
  focus: vi.fn(), reset: vi.fn(), peek: vi.fn(), unpeek: vi.fn(), hold: vi.fn(), resize: vi.fn(), destroy: vi.fn(),
}));
vi.mock('../src/lib/globe/engine', () => ({ createGlobe: (options: GlobeOptions) => { globe.options = options; return globe; } }));

const jeju = exampleTrip('jeju', 'Jeju', ['Seogwipo', 'Seongsan']);
const hanoi = exampleTrip('hanoi', 'Hanoi', ['Lake']);
const setup = (url = '/') => {
  history.replaceState(null, '', url);
  const view = render(<GlobeExplorer trips={[jeju, hanoi]} stats={{ trips: 2, countries: 1, days: 10 }} />);
  return { ...view, user: userEvent.setup() };
};
const sheet = () => document.querySelector<HTMLElement>('.sheet')!;
const isOpen = () => sheet().classList.contains('open');
const searching = () => document.body.classList.contains('search-open');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('innerWidth', 1200);
  vi.stubGlobal('scrollY', 0);
});

describe('opening trips', () => {
  it('opens a pin, and gives the trip its own address', () => {
    setup();
    act(() => globe.options.onSelect(jeju, 1));
    expect(location.search).toBe('?trip=jeju');
    expect(globe.focus).toHaveBeenLastCalledWith(jeju, 1);
    expect(isOpen()).toBe(true);
  });

  it('opens the trip in the address, or nothing when there is no such trip', () => {
    setup('/?trip=hanoi').unmount();
    expect(globe.focus).toHaveBeenCalledWith(hanoi, 0);
    expect(globe.destroy).toHaveBeenCalled();
    setup('/?trip=nope');
    expect(isOpen()).toBe(false);
  });

  it('only changes stop when the open trip is picked again', () => {
    setup('/?trip=jeju');
    const entries = history.length;
    act(() => globe.options.onSelect(jeju, 1)); // the globe's callbacks see the latest state
    expect(history.length).toBe(entries);
    expect(globe.focus).toHaveBeenLastCalledWith(jeju, 1);
  });

  it('closes when arrived at directly, without leaving the site', async () => {
    const { user } = setup('/?trip=jeju');
    await user.keyboard('{Escape}');
    expect(location.search).toBe('');
    expect(isOpen()).toBe(false);
  });

  it('follows Back', async () => {
    setup();
    act(() => globe.options.onSelect(jeju, 0));
    history.back();
    await waitFor(() => expect(isOpen()).toBe(false));
    expect(globe.reset).toHaveBeenCalled();
  });

  it('holds the globe while choosing between trips', async () => {
    const { user } = setup();
    act(() => globe.options.onCluster([jeju, hanoi]));
    expect(globe.hold).toHaveBeenLastCalledWith(true);
    await user.keyboard('{Escape}');
    expect(globe.hold).toHaveBeenLastCalledWith(false);
    expect(isOpen()).toBe(false);
  });
});

describe('keys', () => {
  it('goes round the stops with the arrows', async () => {
    const { user } = setup('/?trip=jeju');
    await user.keyboard('{ArrowLeft}');
    expect(globe.focus).toHaveBeenLastCalledWith(jeju, 1);
    await user.keyboard('{ArrowRight}');
    expect(globe.focus).toHaveBeenLastCalledWith(jeju, 0);
  });

  it('opens search with / or Ctrl+K, and Escape closes it before the trip', async () => {
    const { user } = setup('/?trip=jeju');
    await user.keyboard('/');
    expect(searching()).toBe(true);
    await user.keyboard('{Escape}');
    expect([searching(), isOpen()]).toEqual([false, true]);
    await user.keyboard('{Control>}k{/Control}');
    expect(searching()).toBe(true);
    await user.type(screen.getByRole('combobox'), 'a/b');
    expect(screen.getByRole<HTMLInputElement>('combobox').value).toBe('a/b');
  });

  it('opens a search result', async () => {
    const { user } = setup();
    await user.keyboard('/');
    await user.type(screen.getByRole('combobox'), 'seongsan{Enter}');
    expect(searching()).toBe(false);
    expect(globe.focus).toHaveBeenLastCalledWith(jeju, 1);
  });
});

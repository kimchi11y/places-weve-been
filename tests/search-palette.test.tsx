// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SearchPalette from '../src/components/SearchPalette';
import { exampleTrip } from './dom';

const trips = [exampleTrip('jeju', 'Jeju', ['Seogwipo']), exampleTrip('hanoi', 'Hanoi', ['Old Quarter', 'Lake'])];
function setup(open = true) {
  const on = { onClose: vi.fn(), onPick: vi.fn(), onPeek: vi.fn() };
  const ui = (isOpen: boolean) => <SearchPalette trips={trips} open={isOpen} {...on} />;
  const { rerender, unmount } = render(ui(open));
  return { ...on, show: (isOpen: boolean) => rerender(ui(isOpen)), unmount, user: userEvent.setup() };
}
const input = () => screen.getByRole<HTMLInputElement>('combobox');
const selected = () => screen.getAllByRole('option').findIndex((o) => o.getAttribute('aria-selected') === 'true');

describe('search palette', () => {
  it('shows nothing until opened, then takes focus', async () => {
    const { show } = setup(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    show(true);
    await waitFor(() => expect(document.activeElement).toBe(input()));
  });

  it('moves with the arrow keys, stopping at both ends, and picks with Enter', async () => {
    const { user, onPick } = setup();
    await user.click(input());
    await user.keyboard('{ArrowUp}');
    expect(selected()).toBe(0);
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(selected()).toBe(1);
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith(trips[1], 0);
  });

  it('opens at the stop that matched', async () => {
    const { user, onPick } = setup();
    await user.type(input(), 'lake{Enter}');
    expect(onPick).toHaveBeenCalledWith(trips[1], 1);
  });

  it('copes with no results', async () => {
    const { user, onPick } = setup();
    await user.type(input(), 'atlantis{ArrowDown}{ArrowUp}{Enter}');
    expect(screen.getByText(/Nowhere called “atlantis”/)).toBeTruthy();
    expect(onPick).not.toHaveBeenCalled();
    await user.clear(input());
    expect(selected()).toBe(0);
  });

  it('starts over each time it opens', async () => {
    const { user, show } = setup();
    await user.type(input(), 'hanoi');
    show(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    show(true);
    expect(input().value).toBe('');
    expect(selected()).toBe(0);
  });

  it('starts over even when reopened while still fading out', async () => {
    const { user, show } = setup();
    await user.type(input(), 'hanoi');
    show(false);
    show(true);
    await waitFor(() => expect(input().value).toBe(''));
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('turns the globe toward whatever is highlighted', async () => {
    const { user, onPeek } = setup();
    expect(onPeek).toHaveBeenLastCalledWith(trips[0]);
    await user.type(input(), 'hanoi');
    expect(onPeek).toHaveBeenLastCalledWith(trips[1]);
    await user.type(input(), 'zzz');
    expect(onPeek).toHaveBeenLastCalledWith(null);
  });
});

// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Journals from '../src/components/Journals';
import TripSheet from '../src/components/TripSheet';
import { exampleTrip } from './dom';

const jeju = exampleTrip('jeju', 'Jeju', ['Seogwipo']);
const hanoi = exampleTrip('hanoi', 'Hanoi', ['Lake']);
/** Which photos would carry over to the next page. Two at once and the browser skips the animation. */
const carried = () => [...document.querySelectorAll<HTMLElement>('img')].filter((img) => named(img)).map((img) => img.getAttribute('src'));
// jsdom may not know the property, so look for it either way it can be set
const named = (img: HTMLElement) => img.style.getPropertyValue('view-transition-name') || (img.style as { viewTransitionName?: string }).viewTransitionName;

function setup() {
  document.addEventListener('click', (e) => e.preventDefault()); // stay on this page, as Back would
  render(
    <>
      <Journals trips={[jeju, hanoi]} canEdit={false} />
      <TripSheet trip={jeju} stop={0} picker={null} onStop={vi.fn()} onPick={vi.fn()} onClose={vi.fn()} />
    </>,
  );
}
const card = (title: string) => document.querySelector(`a.folder[href="/trips/${title}"]`)!;

describe('the photo that carries over to a journal', () => {
  it('is only ever the last card clicked', () => {
    setup();
    fireEvent.click(card('jeju'));
    expect(carried()).toEqual(['/jeju-cover/tile']);
    fireEvent.click(card('hanoi'));
    expect(carried()).toEqual(['/hanoi-cover/tile']);
  });

  it('is only ever one of the sheet’s and the cards’', () => {
    setup();
    fireEvent.click(screen.getByRole('link', { name: /Open the journal/ }));
    expect(carried()).toEqual(['/Seogwipo-1/tile']);
    fireEvent.click(card('hanoi'));
    expect(carried()).toEqual(['/hanoi-cover/tile']);
    fireEvent.click(screen.getByRole('link', { name: /Open the journal/ }));
    expect(carried()).toEqual(['/Seogwipo-1/tile']);
  });
});

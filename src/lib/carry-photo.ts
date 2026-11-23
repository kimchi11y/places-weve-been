let carried: HTMLElement | null = null;

/**
 * This photo carries over to the journal's cover as the page changes. Back can bring this page
 * back with the last one still named, and two with the same name would cancel the animation.
 */
export function carryPhoto(photo: HTMLElement | null | undefined) {
  carried?.style.removeProperty('view-transition-name');
  photo?.style.setProperty('view-transition-name', 'vt-cover');
  carried = photo ?? null;
}

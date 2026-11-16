/** The drawings live in StickerSprite.astro, once per page. */
export const Icon = ({ name }: { name: string }) => (
  <svg className="ic" aria-hidden="true"><use href={`#i-${name}`} /></svg>
);

export const Sticker = ({ name, className = '' }: { name: string; className?: string }) => (
  <svg className={`st ${className}`} viewBox="0 0 48 48" aria-hidden="true">
    <use href={`#s-${name}`} className="cut" /><use href={`#s-${name}`} />
  </svg>
);

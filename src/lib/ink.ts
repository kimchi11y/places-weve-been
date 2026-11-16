/** Each trip writes in one of six inks. It comes from the trip's id, so adding a trip never recolours another. */
export const INKS = [
  { ink: '#D23F2B', tint: '#FFDCD2' }, // coral
  { ink: '#2A7A4B', tint: '#D5ECD4' }, // leaf
  { ink: '#7A3FA3', tint: '#E8DBF6' }, // plum
  { ink: '#1C6CB5', tint: '#D3E7F9' }, // sky
  { ink: '#C22A66', tint: '#FBD7E4' }, // rose
  { ink: '#A35E00', tint: '#FCE8B6' }, // amber
] as const;

export function inkFor(tripId: string) {
  let hash = 0;
  for (const ch of tripId) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return INKS[hash % INKS.length];
}

/** For a `style` attribute: everything inside then writes in this trip's ink. */
export const inkStyle = (tripId: string) => {
  const { ink, tint } = inkFor(tripId);
  return `--t:${ink};--tint:${tint}`;
};

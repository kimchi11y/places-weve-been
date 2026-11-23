/** Letters that don't come apart into a plain letter and an accent. */
const LETTERS: Record<string, string> = { ø: 'o', ł: 'l', ß: 'ss', æ: 'ae', œ: 'oe', þ: 'th', đ: 'd', ð: 'd', ı: 'i' };

/** "Seongsan Ilchulbong" → "seongsan-ilchulbong", "Reykjavík" → "reykjavik", "東京" → "東京" */
export const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase()
    .replace(/[øłßæœþđðı]/g, (letter) => LETTERS[letter])
    .replace(/[︀-️]/g, '') // how emoji say they're in colour; not part of any word
    .match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)?.join('-') ?? '';

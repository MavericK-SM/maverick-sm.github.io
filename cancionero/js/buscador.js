// Búsqueda en memoria sobre los cantos (PRD FR-01), igual que SongSearch.kt de la app de Android.
// - Por número (solo dígitos, con o sin letra final): primero el canto exacto y luego los que empiezan igual.
// - Por texto: cada palabra debe aparecer en el título o en la letra; primero los que coinciden por título.

const NUMBER_QUERY = /^\d+[a-z]?$/;

/** Minúsculas, sin tildes ni signos; las palabras quedan separadas por un solo espacio. */
export function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export class SongSearch {
  constructor(songs) {
    this.entries = songs.map((song) => ({
      song,
      number: normalize(song.displayNumber),
      title: normalize(song.title),
      text: normalize(`${song.title} ${song.blocks.map((b) => b.lyrics).join(' ')}`),
    }));
  }

  /** Busca `query` entre los cantos de `categoryId` (o entre todos si es null). */
  search(query, categoryId = null) {
    const candidates = categoryId == null ? this.entries : this.entries.filter((e) => e.song.categoryId === categoryId);
    const normalized = normalize(query);
    let matches;
    if (!normalized) {
      matches = candidates;
    } else if (NUMBER_QUERY.test(normalized)) {
      const exact = candidates.filter((e) => e.number === normalized);
      matches = exact.concat(candidates.filter((e) => e.number !== normalized && e.number.startsWith(normalized)));
    } else {
      const words = normalized.split(' ');
      const inTitle = candidates.filter((e) => words.every((w) => e.title.includes(w)));
      const others = candidates.filter((e) => !inTitle.includes(e) && words.every((w) => e.text.includes(w)));
      matches = inTitle.concat(others);
    }
    return matches.map((e) => e.song);
  }
}

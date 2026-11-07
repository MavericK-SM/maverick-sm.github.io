// Separa la letra de un bloque en líneas y, dentro de cada línea, el texto de las acotaciones (PRD §3.3),
// igual que LyricsParser.kt de la app de Android.
// - Una acotación puede seguir en la línea siguiente (cantos 384 y 389): cada línea recibe su parte.
// - Un ")" sin su "(" es texto normal (las marcas "A)" y "P)" del canto 392), y un "(" que nunca se cierra también.

/** Devuelve las líneas como listas de tramos: { text, annotation }. */
export function parseLyrics(lyrics) {
  const annotated = annotationMask(lyrics);
  const lines = [];
  let start = 0;
  for (;;) {
    const found = lyrics.indexOf('\n', start);
    const end = found >= 0 ? found : lyrics.length;
    lines.push(segments(lyrics, annotated, start, end));
    if (end === lyrics.length) break;
    start = end + 1;
  }
  return lines;
}

function segments(text, annotated, start, end) {
  const result = [];
  let runStart = start;
  for (let i = start + 1; i <= end; i++) {
    if (i === end || annotated[i] !== annotated[runStart]) {
      if (i > runStart) result.push({ text: text.substring(runStart, i), annotation: annotated[runStart] });
      runStart = i;
    }
  }
  return result;
}

function annotationMask(text) {
  const mask = new Array(text.length).fill(false);
  let i = 0;
  while (i < text.length) {
    const close = text[i] === '(' ? closingParenthesis(text, i) : -1;
    if (close >= 0) {
      mask.fill(true, i, close + 1);
      i = close + 1;
    } else {
      i++;
    }
  }
  return mask;
}

function closingParenthesis(text, open) {
  let depth = 0;
  for (let j = open; j < text.length; j++) {
    if (text[j] === '(') depth++;
    else if (text[j] === ')' && --depth === 0) return j;
  }
  return -1;
}

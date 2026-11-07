// La Misa: sus momentos y el link con que se comparte, igual que MassPlan.kt y MassShareLink.kt de la app de
// Android. Link: https://maverick-sm.github.io/cancionero/misa?d=20261101&s=e:3,p:32,c:135+140
// `s` lleva, por cada momento con cantos, su código y los ids; `t` (la comunidad) va solo si no es la parroquia.
// También se lee el formato anterior: ?d=2026-11-01&t=Parroquia+…&s=…

export const SHARE_BASE_URL = 'https://maverick-sm.github.io/cancionero/misa';
export const DEFAULT_COMMUNITY = 'Parroquia Cristo Hijo de Dios';
export const MAX_COMMUNITY_LENGTH = 80;

/** Los momentos de la Misa en que se canta, en su orden; `code` es su clave en el link. */
export const MOMENTS = [
  { code: 'e', step: 1, title: 'Entrada', categoryId: 'cantos_entrada' },
  { code: 'p', step: 2, title: 'Perdón', categoryId: 'cantos_perdon' },
  { code: 'g', step: 3, title: 'Gloria', categoryId: 'cantos_gloria', optional: true },
  { code: 'a', step: 4, title: 'Respuesta y Aleluya', categoryId: 'cantos_respuesta_aleluya', cardName: 'Aleluya' },
  { code: 'o', step: 5, title: 'Ofertorio', categoryId: 'cantos_ofertorio' },
  { code: 's', step: 6, title: 'Santo', categoryId: 'santos' },
  { code: 'pn', step: 7, title: 'Padre Nuestro', categoryId: 'cantos_padre_nuestro', optional: true },
  { code: 'pz', step: 8, title: 'Paz y Cordero', categoryId: 'canto_paz', cardName: 'Paz' },
  { code: 'c', step: 9, title: 'Comunión', categoryId: 'cantos_comunion' },
  { code: 'sa', step: 10, title: 'Salida', categoryId: 'cantos_salida' },
];

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const LINK_PATTERN = /(?:https?:\/\/maverick-sm\.github\.io\/cancionero\/misa(?:\.html)?|cancionero:\/\/misa)\/?\?(\S+)/i;
const TRAILING_PUNCTUATION = '.,;:!?)]}>"\'»';

/** "1. ENTRADA": el rótulo de un momento en la pantalla. */
export const momentLabel = (moment) => `${moment.step}. ${moment.title.toLocaleUpperCase('es-PE')}`;

/** Una Misa vacía: los 10 momentos, sin cantos. */
export function emptyPlan(dateIso, community = DEFAULT_COMMUNITY) {
  return { dateIso, community, slots: MOMENTS.map((m) => ({ code: m.code, songIds: [] })) };
}

export const totalSongs = (plan) => plan.slots.reduce((n, s) => n + s.songIds.length, 0);

/** La fecha de hoy (del celular) como "2026-11-01". */
export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** El domingo que viene, u hoy si ya es domingo. */
export function nextSundayIso(now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() + ((7 - date.getDay()) % 7));
  return todayIso(date);
}

/** { year, month (1–12), day, weekday (0 = domingo) } o null si la fecha no es válida. */
export function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day, weekday: date.getUTCDay() };
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** "domingo 1 de noviembre", para el aviso. */
export function formatSpanishDate(iso) {
  const d = parseDate(iso);
  return d ? `${DAY_NAMES[d.weekday]} ${d.day} de ${MONTH_NAMES[d.month - 1]}` : iso;
}

/** "Domingo, 1 de noviembre de 2026", para la ficha y la pantalla. */
export function formatHeaderDate(iso) {
  const d = parseDate(iso);
  return d ? `${capitalize(DAY_NAMES[d.weekday])}, ${d.day} de ${MONTH_NAMES[d.month - 1]} de ${d.year}` : iso;
}

/** "Domingo 01 Nov 2026", para la ficha y el mensaje. */
export function formatShortDate(iso) {
  const d = parseDate(iso);
  return d ? `${capitalize(DAY_NAMES[d.weekday])} ${pad(d.day)} ${capitalize(MONTH_NAMES[d.month - 1].slice(0, 3))} ${d.year}` : iso;
}

/** `e:3,p:32,c:135+140`: los momentos con cantos, en su orden. */
export function encodeSlots(slots) {
  return slots
    .filter((s) => s.songIds.length > 0)
    .map((s) => `${s.code}:${s.songIds.join('+')}`)
    .join(',');
}

/** Los 10 momentos en orden, con los cantos que traiga `spec`; se ignoran los códigos y los ids no válidos. */
export function decodeSlots(spec) {
  const byCode = new Map(MOMENTS.map((m) => [m.code, []]));
  for (const entry of spec.split(',')) {
    const colon = entry.indexOf(':');
    if (colon < 0) continue;
    const ids = byCode.get(entry.slice(0, colon).trim());
    if (!ids) continue;
    for (const id of entry.slice(colon + 1).split(/[+ ]/)) {
      const t = id.trim();
      if (/^-?\d+$/.test(t) && Number(t) > 0) ids.push(Number(t));
    }
  }
  return MOMENTS.map((m) => ({ code: m.code, songIds: byCode.get(m.code) }));
}

/** El link más corto posible: la fecha sin guiones y la comunidad solo si no es la parroquia. */
export function encodeUrl(plan) {
  let url = `${SHARE_BASE_URL}?d=${plan.dateIso.replaceAll('-', '')}`;
  if (plan.community !== DEFAULT_COMMUNITY) url += `&t=${formEncode(plan.community)}`;
  return `${url}&s=${encodeSlots(plan.slots)}`;
}

/** El mensaje que acompaña a la ficha (texto del autor); la comunidad va en negrita de WhatsApp. */
export function buildWhatsAppMessage(plan) {
  return [
    `*${plan.community.trim() || DEFAULT_COMMUNITY}*`,
    '',
    '¡Hola a todos! 🎶',
    `Aquí tienen el repertorio del ${formatShortDate(plan.dateIso)}:`,
    '',
    `🔗 ${encodeUrl(plan)}`,
    '',
    'Solo dale un toque al link para que se importe a tu aplicación. ¡Bendiciones! 🙏',
  ].join('\n');
}

/**
 * Lee el link solo o dentro de un texto (el mensaje entero de WhatsApp). Devuelve null si no hay link, si la
 * fecha no es válida o si no trae cantos.
 */
export function parseLink(input) {
  const match = LINK_PATTERN.exec(input);
  if (!match) return null;
  let query = match[1];
  while (query && TRAILING_PUNCTUATION.includes(query[query.length - 1])) query = query.slice(0, -1);
  return parseQuery(query);
}

/** Lo mismo, a partir de lo que va después del "?" del link. */
export function parseQuery(query) {
  const params = new Map();
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    const key = eq < 0 ? part : part.slice(0, eq);
    params.set(key, eq < 0 ? '' : part.slice(eq + 1));
  }
  if (!params.has('d')) return null;
  const dateIso = formDecode(params.get('d')).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  if (!parseDate(dateIso)) return null;
  const community = params.has('t') ? formDecode(params.get('t')).trim().slice(0, MAX_COMMUNITY_LENGTH) : '';
  // En `s` el "+" separa ids: se conserva en vez de volverse espacio al decodificar.
  const slots = decodeSlots(formDecode((params.get('s') || '').replaceAll('+', '%2B')));
  if (slots.every((s) => s.songIds.length === 0)) return null;
  return { dateIso, community: community || DEFAULT_COMMUNITY, slots };
}

/**
 * Las Misas de «Hoy», la de fecha más cercana a `today` primero (hoy, luego a un día, a dos…); a igual
 * distancia, primero la que aún no pasó. Las de fecha inválida van al final.
 */
export function sortByClosestDate(history, today = todayIso()) {
  const t = parseDate(today);
  const dayNumber = (d) => Date.UTC(d.year, d.month - 1, d.day) / 86400000;
  const key = (plan) => {
    const d = parseDate(plan.dateIso);
    if (!d) return Number.MAX_SAFE_INTEGER;
    const diff = dayNumber(d) - dayNumber(t);
    return Math.abs(diff) * 2 + (diff < 0 ? 1 : 0);
  };
  return history.slice().sort((a, b) => key(a) - key(b) || (b.updatedAt || 0) - (a.updatedAt || 0));
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Como URLEncoder de Java: espacios como "+" y todo lo demás con %, salvo letras, números y .-*_ */
function formEncode(value) {
  return encodeURIComponent(value)
    .replace(/[!'()~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+');
}

function formDecode(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

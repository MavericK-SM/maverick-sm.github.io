// Lo que se guarda en el celular (localStorage): preferencias, favoritos, recientes y Misas.
// Hace lo de DataStore y Room en la app de Android. Los cantos se guardan por su id, como allá.
import { emptyPlan, encodeSlots, decodeSlots, nextSundayIso, DEFAULT_COMMUNITY } from './misa.js';

const KEY = 'cancionero.v1';
export const MIN_FONT = 16;
export const MAX_FONT = 36;
export const DEFAULT_FONT = 20;
const MAX_RECENTS = 20;

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

const data = Object.assign(
  { theme: 'system', fontSize: DEFAULT_FONT, reduceTransparency: null, favorites: [], recents: [], currentMass: null, massHistory: [], nextMassId: 1 },
  load(),
);
const listeners = new Set();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Sin espacio o en modo privado: se sigue funcionando en memoria.
  }
  listeners.forEach((fn) => fn());
}

export const onChange = (fn) => listeners.add(fn);

// Que el sistema no borre lo guardado si el celular necesita espacio (donde se puede).
navigator.storage?.persist?.().catch(() => {});

export const prefs = {
  get theme() {
    return data.theme;
  },
  set theme(value) {
    data.theme = value;
    save();
  },
  get fontSize() {
    return data.fontSize;
  },
  set fontSize(value) {
    data.fontSize = Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(value)));
    save();
  },
  /** null = lo decide el equipo (§5.4). */
  get reduceTransparency() {
    return data.reduceTransparency;
  },
  set reduceTransparency(value) {
    data.reduceTransparency = value;
    save();
  },
};

export const favorites = {
  list: () => data.favorites.slice(),
  has: (id) => data.favorites.includes(id),
  toggle(id) {
    data.favorites = this.has(id) ? data.favorites.filter((x) => x !== id) : [...data.favorites, id];
    save();
  },
  setOrder(ids) {
    data.favorites = ids.slice();
    save();
  },
};

export const recents = {
  list: () => data.recents.slice(),
  add(id) {
    data.recents = [id, ...data.recents.filter((x) => x !== id)].slice(0, MAX_RECENTS);
    save();
  },
};

const toPlan = (stored) => ({ ...stored, slots: decodeSlots(stored.slotsSpec) });
const toStored = (plan) => ({ id: plan.id, dateIso: plan.dateIso, community: plan.community, slotsSpec: encodeSlots(plan.slots), updatedAt: Date.now() });

export const mass = {
  /** La Próxima Misa; si aún no hay ninguna, una vacía para el domingo que viene. */
  current() {
    return data.currentMass ? toPlan(data.currentMass) : emptyPlan(nextSundayIso(), DEFAULT_COMMUNITY);
  },
  saveCurrent(plan) {
    data.currentMass = toStored(plan);
    save();
  },
  history: () => data.massHistory.map(toPlan),
  /** Guarda en «Hoy» (al compartirla o al abrir un link), sin repetir una Misa idéntica. */
  saveToHistory(plan) {
    const stored = toStored(plan);
    const same = data.massHistory.find((p) => p.dateIso === stored.dateIso && p.community === stored.community && p.slotsSpec === stored.slotsSpec);
    if (same) {
      same.updatedAt = stored.updatedAt;
    } else {
      stored.id = data.nextMassId++;
      data.massHistory.push(stored);
    }
    save();
  },
  delete(id) {
    data.massHistory = data.massHistory.filter((p) => p.id !== id);
    save();
  },
};

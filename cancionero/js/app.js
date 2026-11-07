// Cancionero web: las mismas pantallas de la app de Android (PRD §4 y §5.6) para iPhone y cualquier navegador.
import { ICONS } from './iconos.js';
import { SongSearch } from './buscador.js';
import { parseLyrics } from './letra.js';
import * as M from './misa.js';
import { prefs, favorites, recents, mass, MIN_FONT, MAX_FONT } from './almacen.js';
import { drawMassCard } from './ficha.js';

export const WEB_VERSION = '1.0';

const CATEGORY_ICONS = {
  cantos_entrada: 'cat-door-front',
  cantos_perdon: 'cat-cross',
  cantos_gloria: 'cat-light-mode',
  cantos_respuesta_aleluya: 'menu-book',
  cantos_ofertorio: 'cat-bakery-dining',
  santos: 'cat-auto-awesome',
  cantos_padre_nuestro: 'cat-volunteer-activism',
  canto_paz: 'cat-handshake',
  cantos_comunion: 'cat-wine-bar',
  cantos_salida: 'cat-directions-walk',
  cantos_navidenos: 'cat-star',
  renovacion_parroquial: 'cat-church',
  cantos_espiritu_santo: 'cat-local-fire-department',
  cantos_maria: 'cat-local-florist',
};
const TABS = [
  { id: 'songs', hash: '#/', label: 'Cancionero', icon: 'menu-book' },
  { id: 'mass', hash: '#/misa', label: 'Misa', icon: 'mass' },
  { id: 'favorites', hash: '#/favoritos', label: 'Favoritos', icon: 'favorite' },
  { id: 'settings', hash: '#/ajustes', label: 'Ajustes', icon: 'settings' },
];
const LICENSES = [
  { name: 'Inter', detail: 'Rasmus Andersson — SIL Open Font License 1.1', file: 'fuentes/inter-ofl.txt' },
  { name: 'Source Serif 4', detail: 'Adobe — SIL Open Font License 1.1', file: 'fuentes/source-serif-ofl.txt' },
  { name: 'Material Symbols', detail: 'Google — Apache License 2.0', file: 'fuentes/apache-2.0.txt' },
];

let catalog;
let songsById;
let categoryById;
let search;

const ui = {
  screen: 'home',
  tab: 'songs',
  section: null,
  searchOpen: false,
  query: '',
  openedFromSearch: false,
  massTab: 'today',
  reader: null, // { id, playlist, index }
};

// ---------- DOM ----------

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (['value', 'hidden', 'disabled', 'checked'].includes(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

function icon(name) {
  const tpl = document.createElement('template');
  tpl.innerHTML = ICONS[name];
  return tpl.content.firstChild;
}

const $ = (id) => document.getElementById(id);
const plural = (n) => (n === 1 ? '1 canto' : `${n} cantos`);

// ---------- Apariencia (FR-06, FR-09, FR-04) ----------

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
/** §5.4: con "Reducir movimiento" del sistema o en un equipo de poca memoria. */
const autoReduceTransparency = () => motionQuery.matches || (navigator.deviceMemory != null && navigator.deviceMemory < 4);
const reduceTransparency = () => prefs.reduceTransparency ?? autoReduceTransparency();

function applyAppearance() {
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && darkQuery.matches);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.classList.toggle('solid', reduceTransparency());
  root.style.setProperty('--font-size', `${prefs.fontSize}px`);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#000000' : '#ffffff');
}
darkQuery.addEventListener('change', applyAppearance);
motionQuery.addEventListener('change', applyAppearance);

// ---------- Navegación ----------

function parseRoute() {
  const hash = location.hash || '#/';
  const [path, query = ''] = hash.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  switch (parts[0]) {
    case 'seccion':
      return { screen: 'home', section: decodeURIComponent(parts[1] || '') };
    case 'misa':
      return { screen: 'mass' };
    case 'favoritos':
      return { screen: 'favorites' };
    case 'ajustes':
      return { screen: 'settings' };
    case 'licencias':
      return { screen: 'licenses' };
    case 'canto': {
      const id = Number(parts[1]);
      const playlist = (parts[3] || '').split(',').map(Number).filter((n) => n > 0);
      return { screen: 'reader', id, playlist, index: Number(parts[2]) || 0 };
    }
    case 'importar':
      return { screen: 'import', query };
    default:
      return { screen: 'home', section: null };
  }
}

const depth = () => history.state?.depth || 0;
/** Abre una pantalla encima (lector, sección, licencias): [‹] y el gesto de volver regresan. */
function push(hash) {
  history.pushState({ depth: depth() + 1 }, '', hash);
  route();
}
function replace(hash) {
  history.replaceState({ depth: depth() }, '', hash);
  route();
}
function back(fallback) {
  if (depth() > 0) history.back();
  else replace(fallback);
}
addEventListener('popstate', route);

function route() {
  const r = parseRoute();
  if (r.screen === 'import') {
    importMassLink(r.query);
    return;
  }
  const leavingReader = ui.screen === 'reader' && r.screen !== 'reader';
  ui.screen = r.screen;
  if (r.screen === 'home') {
    ui.tab = 'songs';
    if (ui.section !== r.section) {
      ui.section = r.section || null;
      $('home').scrollTop = 0;
    }
  } else if (r.screen !== 'reader' && r.screen !== 'licenses') {
    ui.tab = r.screen === 'mass' ? 'mass' : r.screen;
  }
  if (r.screen === 'reader') ui.reader = { id: r.id, playlist: r.playlist, index: r.index };
  for (const screen of document.querySelectorAll('.screen')) screen.hidden = screen.id !== r.screen;
  if (leavingReader) keepAwake(false);
  render();
}

function selectTab(tab) {
  if (tab === 'songs') resetHome();
  replace(TABS.find((t) => t.id === tab).hash);
}

/** Tocar [Cancionero]: borra la búsqueda y la sección, cierra el buscador y vuelve arriba (FR-01). */
function resetHome() {
  ui.section = null;
  ui.query = '';
  ui.searchOpen = false;
  ui.openedFromSearch = false;
  $('home').scrollTop = 0;
}

function render() {
  renderBar();
  if (ui.screen === 'home') renderHome();
  else if (ui.screen === 'mass') renderMass();
  else if (ui.screen === 'favorites') renderFavorites();
  else if (ui.screen === 'settings') renderSettings();
  else if (ui.screen === 'licenses') renderLicenses();
  else if (ui.screen === 'reader') renderReader();
}

// ---------- Barra inferior (§5.5) ----------

function renderBar() {
  const bar = $('bar');
  bar.hidden = ui.screen === 'licenses';
  if (ui.screen === 'reader') {
    const { playlist, index } = ui.reader;
    const hasPlaylist = playlist.length > 1;
    bar.replaceChildren(
      h(
        'div',
        { class: 'reader-bar' },
        hasPlaylist && index > 0 ? glassButton('chevron-left', 'Canto anterior', () => openPlaylistAt(index - 1), 'big') : null,
        h('div', { class: 'slider-capsule glass' }, fontSlider()),
        hasPlaylist && index < playlist.length - 1 ? glassButton('chevron-right', 'Canto siguiente', () => openPlaylistAt(index + 1), 'big') : null,
      ),
    );
    return;
  }
  const selected = TABS.findIndex((t) => t.id === ui.tab);
  const pill = h('span', { class: 'pill', style: `transform: translateX(${selected * 56}px)` });
  const dock = h(
    'div',
    { class: 'dock glass', role: 'tablist', 'aria-label': 'Secciones de la app' },
    pill,
    TABS.map((tab, i) =>
      h(
        'button',
        { role: 'tab', 'aria-selected': String(i === selected), 'aria-label': tab.label, title: tab.label, onclick: () => selectTab(tab.id) },
        icon(i === selected ? `${tab.icon}-filled` : tab.icon),
      ),
    ),
  );
  bar.replaceChildren(dock, glassButton('search', 'Buscar', openSearchFromBar, 'big'));
}

function glassButton(name, label, onclick, size = '') {
  return h('button', { class: `glass glass-circle ${size}`, 'aria-label': label, title: label, onclick }, icon(name));
}

/** A− ━━●━━ A+ (FR-04): 16–36, en pasos de 1, para todos los cantos. */
function fontSlider() {
  const range = h('input', {
    type: 'range',
    min: MIN_FONT,
    max: MAX_FONT,
    step: 1,
    value: prefs.fontSize,
    'aria-label': 'Tamaño de letra',
    oninput: (e) => setFontSize(Number(e.target.value)),
  });
  paintRange(range);
  return [
    h('button', { class: 'step', 'aria-label': 'Letra más pequeña', onclick: () => setFontSize(prefs.fontSize - 1) }, 'A−'),
    range,
    h('button', { class: 'step big', 'aria-label': 'Letra más grande', onclick: () => setFontSize(prefs.fontSize + 1) }, 'A+'),
  ];
}

function paintRange(range) {
  range.style.setProperty('--pct', `${((range.value - MIN_FONT) / (MAX_FONT - MIN_FONT)) * 100}%`);
}

function setFontSize(value) {
  prefs.fontSize = value;
  applyAppearance();
  for (const range of document.querySelectorAll('input[type="range"]')) {
    range.value = prefs.fontSize;
    paintRange(range);
  }
}

// ---------- Inicio (FR-01, FR-02, FR-08) ----------

function buildHome() {
  const input = h('input', {
    type: 'search',
    id: 'search-input',
    placeholder: 'Busca por número, título o letra',
    'aria-label': 'Buscar canto por número, título o letra',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    oninput: (e) => {
      ui.query = e.target.value;
      ui.openedFromSearch = false;
      renderHomeContent();
    },
    onkeydown: (e) => {
      if (e.key === 'Enter') e.target.blur();
      if (e.key === 'Escape') closeSearch();
    },
  });
  const clear = h('button', { class: 'clear', 'aria-label': 'Borrar búsqueda', onclick: onSearchX }, icon('close'));
  $('home').append(
    h('div', { class: 'compact-bar', id: 'compact-bar', 'aria-hidden': 'true' }, h('p', { class: 'compact-title' }, 'Cancionero')),
    h(
      'header',
      { class: 'home-header', id: 'home-header' },
      h('span', { class: 'cross' }, icon('cross-ornament')),
      h('h1', { class: 'large-title' }, 'Cancionero'),
      h('p', { class: 'parish' }, 'Parroquia Cristo Hijo de Dios'),
    ),
    h('div', { class: 'search-wrap', id: 'search-wrap', hidden: true }, h('div', { class: 'search', role: 'search' }, icon('search'), input, clear)),
    h('div', { id: 'home-content' }),
  );
  $('compact-bar').addEventListener('click', () => $('home').scrollTo({ top: 0, behavior: 'smooth' }));
  $('home').addEventListener('scroll', () => {
    const collapsed = $('home').scrollTop > $('home-header').offsetHeight - 30;
    $('compact-bar').classList.toggle('shown', collapsed);
    $('home').classList.toggle('collapsed', collapsed);
  });
}

function renderHome() {
  $('search-wrap').hidden = !ui.searchOpen;
  $('search-input').value = ui.query;
  renderHomeContent();
}

function renderHomeContent() {
  const content = $('home-content');
  const nodes = [];
  const section = ui.section ? categoryById.get(ui.section) : null;
  if (section) {
    nodes.push(
      h(
        'div',
        { class: 'open-section' },
        h('button', { class: 'back-link', onclick: () => back('#/') }, icon('chevron-left'), 'Volver a Secciones'),
        h('h2', { class: 'about-title' }, section.name),
        h('p', { class: 'subtitle' }, plural(section.count)),
      ),
    );
  }
  const query = ui.query.trim();
  if (query) {
    const results = search.search(query, section ? section.id : null);
    if (results.length === 0) {
      nodes.push(
        h(
          'div',
          { class: 'empty' },
          h('p', { class: 'title' }, `No hay cantos para «${query}»`),
          h('p', { class: 'subtitle' }, 'Prueba con otra palabra o con el número del canto.'),
        ),
      );
    } else {
      nodes.push(songList(results.slice(0, 200), { fromSearch: true }));
    }
  } else if (section) {
    nodes.push(songList(catalog.songs.filter((s) => s.categoryId === section.id), {}));
  } else {
    const recent = recents
      .list()
      .map((id) => songsById.get(id))
      .filter(Boolean)
      .slice(0, 5);
    if (recent.length) {
      nodes.push(h('h2', { class: 'section-label group-label' }, 'Recientes'));
      nodes.push(
        h(
          'div',
          { class: 'recents' },
          recent.map((song) =>
            h(
              'button',
              { class: 'recent', 'aria-label': `Canto ${song.displayNumber}, ${song.title}`, onclick: () => openSong(song.id) },
              h('span', { class: 'num' }, song.displayNumber),
              h('span', { class: 'title' }, song.title),
              h('span', { class: 'cat' }, song.categoryName),
            ),
          ),
        ),
      );
    }
    nodes.push(h('h2', { class: 'section-label group-label' }, 'Secciones'));
    nodes.push(
      h(
        'div',
        { class: 'list' },
        catalog.categories.map((c) =>
          h(
            'button',
            { class: 'card section-row', onclick: () => push(`#/seccion/${c.id}`) },
            h('span', { class: 'circle' }, icon(CATEGORY_ICONS[c.id] || 'cat-music-note')),
            h('span', { class: 'text' }, h('span', { class: 'name' }, c.name), h('span', { class: 'subtitle', style: 'display:block' }, plural(c.count))),
            h('span', { class: 'chevron' }, icon('chevron-right')),
          ),
        ),
      ),
    );
  }
  content.replaceChildren(...nodes);
}

function openSearchFromBar() {
  if (ui.screen !== 'home') replace(ui.section ? `#/seccion/${ui.section}` : '#/');
  ui.searchOpen = true;
  $('search-wrap').hidden = false;
  // En el mismo toque, para que el iPhone abra el teclado.
  $('search-input').focus();
}

/** La X borra lo escrito; si ya está vacío, o si ya se abrió un canto de esta búsqueda, cierra el buscador. */
function onSearchX() {
  if (ui.query && !ui.openedFromSearch) {
    ui.query = '';
    $('search-input').value = '';
    $('search-input').focus();
    renderHomeContent();
  } else {
    closeSearch();
  }
}

function closeSearch() {
  ui.query = '';
  ui.searchOpen = false;
  ui.openedFromSearch = false;
  $('search-input').blur();
  renderHome();
}

function songList(list, { fromSearch = false, showCategory = true, onPick = null }) {
  return h(
    'div',
    { class: 'list' },
    list.map((song) => songRow(song, { fromSearch, showCategory, onPick })),
  );
}

function songRow(song, { fromSearch = false, showCategory = true, onPick = null, heart = true } = {}) {
  const fav = favorites.has(song.id);
  const heartButton = heart
    ? h(
        'button',
        {
          class: `heart${fav ? ' on' : ''}`,
          'aria-label': fav ? 'Quitar de favoritos' : 'Agregar a favoritos',
          'aria-pressed': String(fav),
          onclick: (e) => {
            favorites.toggle(song.id);
            const on = favorites.has(song.id);
            e.currentTarget.classList.toggle('on', on);
            e.currentTarget.setAttribute('aria-label', on ? 'Quitar de favoritos' : 'Agregar a favoritos');
            e.currentTarget.setAttribute('aria-pressed', String(on));
            e.currentTarget.replaceChildren(icon(on ? 'favorite-filled' : 'favorite'));
          },
        },
        icon(fav ? 'favorite-filled' : 'favorite'),
      )
    : null;
  return h(
    'div',
    { class: 'card song-row', 'data-id': song.id },
    h(
      'button',
      {
        class: 'open',
        onclick: () => {
          if (onPick) return onPick(song);
          if (fromSearch) {
            ui.openedFromSearch = true;
            $('search-input').blur();
          }
          openSong(song.id);
        },
      },
      h('span', { class: 'badge', 'aria-label': `Canto ${song.displayNumber}` }, song.displayNumber),
      h('span', { class: 'text' }, h('span', { class: 'title' }, song.title), showCategory ? h('span', { class: 'cat' }, song.categoryName) : null),
    ),
    heartButton,
  );
}

// ---------- Lector (FR-03, FR-07) ----------

function openSong(id) {
  push(`#/canto/${id}`);
}

function openPlaylistAt(index) {
  const { playlist } = ui.reader;
  // Las flechas reemplazan el lector: volver siempre regresa a Misa.
  replace(`#/canto/${playlist[index]}/${index}/${playlist.join(',')}`);
}

function buildReader() {
  $('reader').append(
    h(
      'div',
      { class: 'reader-top' },
      glassButton('chevron-left', 'Volver', () => back(ui.reader?.playlist.length ? '#/misa' : '#/')),
      h('span', { id: 'reader-fav' }),
    ),
    h('article', { class: 'reader-body', id: 'reader-body' }),
  );
}

function renderReader() {
  const song = songsById.get(ui.reader.id);
  const body = $('reader-body');
  $('reader').scrollTop = 0;
  if (!song) {
    $('reader-fav').replaceChildren();
    body.replaceChildren(h('p', { class: 'not-found' }, 'No se encontró este canto.'));
    return;
  }
  recents.add(song.id);
  keepAwake(true);
  renderReaderFavorite(song);
  document.title = `${song.displayNumber}. ${song.title} — Cancionero`;
  body.replaceChildren(
    h(
      'div',
      { class: 'chips' },
      h('span', { class: 'chip cat' }, song.categoryName),
      h('span', { class: 'chip num' }, `Canto ${song.displayNumber}`),
    ),
    h('h1', { class: 'reader-title' }, song.title),
    h(
      'div',
      { class: 'blocks' },
      song.blocks.map((block) => {
        const chorus = block.type === 'CORO';
        return h(
          'p',
          { class: `block${chorus ? ' chorus' : ''}` },
          chorus ? h('span', { class: 'chorus-label', 'aria-hidden': 'true' }, 'CORO') : null,
          h('span', { class: 'sr-only' }, chorus ? 'Coro. ' : 'Estrofa. '),
          parseLyrics(block.lyrics).map((line) =>
            h(
              'span',
              { class: 'line' },
              line.map((seg) => (seg.annotation ? h('span', { class: 'annotation' }, seg.text) : seg.text)),
            ),
          ),
        );
      }),
    ),
  );
}

/** El corazón del lector: dorado si es favorito. */
function renderReaderFavorite(song) {
  const fav = favorites.has(song.id);
  const button = glassButton(fav ? 'favorite-filled' : 'favorite', fav ? 'Quitar de favoritos' : 'Agregar a favoritos', () => {
    favorites.toggle(song.id);
    renderReaderFavorite(song);
  });
  button.setAttribute('aria-pressed', String(fav));
  if (fav) button.classList.add('fav-on');
  $('reader-fav').replaceChildren(button);
}

let wakeLock = null;
async function keepAwake(on) {
  if (!on) {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
    document.title = 'Cancionero';
    return;
  }
  if (wakeLock || !navigator.wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => (wakeLock = null));
  } catch {
    wakeLock = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ui.screen === 'reader') keepAwake(true);
});

// ---------- Favoritos (FR-05) ----------

function renderFavorites() {
  const screen = $('favorites');
  const list = favorites
    .list()
    .map((id) => songsById.get(id))
    .filter(Boolean);
  const header = h('header', { class: 'screen-header' }, h('h1', { class: 'large-title' }, 'Favoritos'));
  if (list.length === 0) {
    screen.replaceChildren(
      header,
      h(
        'div',
        { class: 'empty' },
        h('p', { class: 'title' }, 'Aún no tienes favoritos'),
        h('p', { class: 'subtitle' }, 'Toca el corazón ♡ junto a un canto, o en el lector, para guardarlo aquí.'),
      ),
    );
    return;
  }
  const rows = list.map((song) => {
    const row = songRow(song);
    row.style.setProperty('-webkit-user-select', 'none');
    row.style.setProperty('-webkit-touch-callout', 'none');
    const handle = h('span', { class: 'drag-handle', 'aria-hidden': 'true' }, icon('drag-indicator'));
    row.append(handle);
    return row;
  });
  const container = h('div', { class: 'list', id: 'favorites-list' }, rows);
  screen.replaceChildren(
    header,
    list.length > 1 ? h('p', { class: 'caption hint' }, 'Mantén presionado un canto y arrástralo para cambiar el orden.') : null,
    container,
  );
  enableReorder(container);
}

/** Reordenar arrastrando: mantener presionada la fila o tomarla de su asa. */
function enableReorder(container) {
  let drag = null;
  let pressTimer = null;
  let start = null;

  const rows = () => [...container.children];
  const begin = (row, y) => {
    const all = rows();
    drag = { row, startY: y, from: all.indexOf(row), to: all.indexOf(row), step: row.offsetHeight + 8, all };
    row.classList.add('dragging');
    navigator.vibrate?.(10);
  };
  const move = (y) => {
    const dy = y - drag.startY;
    drag.row.style.transform = `translateY(${dy}px)`;
    const to = Math.max(0, Math.min(drag.all.length - 1, drag.from + Math.round(dy / drag.step)));
    drag.to = to;
    drag.all.forEach((r, i) => {
      if (r === drag.row) return;
      let shift = 0;
      if (drag.from < to && i > drag.from && i <= to) shift = -drag.step;
      if (drag.from > to && i < drag.from && i >= to) shift = drag.step;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
      r.style.transition = 'transform 0.15s';
    });
  };
  const end = () => {
    clearTimeout(pressTimer);
    pressTimer = null;
    if (!drag) return;
    const ids = drag.all.map((r) => Number(r.dataset.id));
    const [moved] = ids.splice(drag.from, 1);
    ids.splice(drag.to, 0, moved);
    drag = null;
    // El toque que termina el arrastre no abre el canto.
    suppressClicksUntil = Date.now() + 500;
    favorites.setOrder(ids);
    renderFavorites();
  };

  container.addEventListener('touchstart', (e) => {
    const row = e.target.closest('.song-row');
    if (!row || e.touches.length > 1) return;
    start = { row, y: e.touches[0].clientY, x: e.touches[0].clientX };
    if (e.target.closest('.drag-handle')) {
      e.preventDefault();
      begin(row, start.y);
    } else {
      pressTimer = setTimeout(() => begin(row, start.y), 400);
    }
  }, { passive: false });
  container.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (drag) {
      e.preventDefault();
      move(t.clientY);
    } else if (pressTimer && start && Math.hypot(t.clientY - start.y, t.clientX - start.x) > 8) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }, { passive: false });
  container.addEventListener('touchend', end);
  container.addEventListener('touchcancel', end);
  // Con mouse: se arrastra desde el asa.
  container.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.drag-handle')) return;
    e.preventDefault();
    begin(e.target.closest('.song-row'), e.clientY);
    const onMove = (ev) => move(ev.clientY);
    const onUp = () => {
      removeEventListener('mousemove', onMove);
      removeEventListener('mouseup', onUp);
      end();
    };
    addEventListener('mousemove', onMove);
    addEventListener('mouseup', onUp);
  });
  // Un toque largo no debe abrir el menú del sistema.
  container.addEventListener('contextmenu', (e) => e.preventDefault());
}

let suppressClicksUntil = 0;
document.addEventListener(
  'click',
  (e) => {
    if (Date.now() < suppressClicksUntil) {
      e.stopPropagation();
      e.preventDefault();
    }
  },
  true,
);

// ---------- Ajustes (FR-06, FR-09, FR-10) ----------

function segmented(labels, selectedIndex, onSelect, role = 'radiogroup', label = '') {
  const count = labels.length;
  const thumb = h('span', { class: 'thumb', style: `width: calc((100% - 8px) / ${count}); transform: translateX(${selectedIndex * 100}%)` });
  return h(
    'div',
    { class: 'segmented', role: role === 'tab' ? 'tablist' : 'radiogroup', 'aria-label': label },
    thumb,
    labels.map((text, i) =>
      h(
        'button',
        role === 'tab'
          ? { role: 'tab', 'aria-selected': String(i === selectedIndex), onclick: () => onSelect(i) }
          : { role: 'radio', 'aria-checked': String(i === selectedIndex), onclick: () => onSelect(i) },
        text,
      ),
    ),
  );
}

function renderSettings() {
  const themes = ['light', 'dark', 'system'];
  const auto = prefs.reduceTransparency == null && autoReduceTransparency();
  const reduced = reduceTransparency();
  $('settings').replaceChildren(
    h('header', { class: 'screen-header' }, h('h1', { class: 'large-title' }, 'Ajustes')),
    h('h2', { class: 'section-label group-label' }, 'Apariencia'),
    h(
      'div',
      { class: 'group' },
      h(
        'div',
        { class: 'card settings-card' },
        segmented(['Claro', 'Oscuro', 'Automático'], themes.indexOf(prefs.theme), (i) => {
          prefs.theme = themes[i];
          applyAppearance();
          renderSettings();
        }, 'radio', 'Tema'),
      ),
    ),
    h('h2', { class: 'section-label group-label' }, 'Tamaño de letra'),
    h(
      'div',
      { class: 'group' },
      h(
        'div',
        { class: 'card settings-card' },
        h('div', { class: 'font-row' }, fontSlider()),
        h(
          'div',
          { class: 'preview' },
          h('p', { class: 'block' }, 'Así se verá la letra de los cantos.'),
          h('p', { class: 'block chorus', style: 'margin-top:12px' }, 'Y así se verán los coros.'),
        ),
      ),
    ),
    h('h2', { class: 'section-label group-label' }, 'Transparencia'),
    h(
      'div',
      { class: 'group' },
      h(
        'div',
        { class: 'card settings-card' },
        h(
          'div',
          { class: 'switch-row' },
          h(
            'div',
            { class: 'text' },
            h('div', { class: 'label', id: 'reduce-label' }, 'Reducir transparencia'),
            h('p', { class: 'caption' }, 'Reemplaza el efecto de cristal por superficies sólidas.'),
            auto ? h('p', { class: 'caption' }, 'Activado automáticamente en este equipo.') : null,
          ),
          h('button', {
            class: 'switch',
            role: 'switch',
            'aria-checked': String(reduced),
            'aria-labelledby': 'reduce-label',
            onclick: () => {
              prefs.reduceTransparency = !reduced;
              applyAppearance();
              renderSettings();
            },
          }),
        ),
      ),
    ),
    h('h2', { class: 'section-label group-label' }, 'Acerca de'),
    h(
      'div',
      { class: 'group' },
      h(
        'div',
        { class: 'card settings-card about' },
        h('h3', { class: 'about-title' }, 'Cancionero'),
        h('p', { class: 'muted', style: 'margin-top:2px' }, 'Parroquia Cristo Hijo de Dios'),
        h('p', { class: 'muted' }, `Versión web ${WEB_VERSION} · Contenido v${catalog.contentVersion}`),
        h('p', {}, 'Diseño y desarrollo: ', h('strong', {}, 'Maverick Samame Moreno')),
        h('p', {}, '© 2026 Maverick Samame Moreno. Todos los derechos reservados sobre el software, el diseño y la recopilación digital de esta aplicación.'),
        h('p', {}, 'Las letras de los cantos pertenecen a sus respectivos autores y editoriales. Se reproducen con fines exclusivamente pastorales, para uso gratuito y sin fines de lucro dentro de la comunidad parroquial.'),
        h('p', {}, 'Aplicación de distribución gratuita. Se prohíbe su venta, modificación o redistribución con otro nombre sin autorización del autor.'),
        h('button', { class: 'link-row', onclick: () => push('#/licencias') }, 'Licencias de código abierto', icon('chevron-right')),
      ),
    ),
  );
}

function renderLicenses() {
  $('licenses').replaceChildren(
    h('div', { class: 'reader-top' }, glassButton('chevron-left', 'Volver', () => back('#/ajustes'))),
    h('header', { class: 'screen-header', style: 'padding-top:0' }, h('h1', { class: 'large-title' }, 'Licencias de código abierto')),
    h('p', { class: 'subtitle hint' }, 'Esta app usa software y recursos de terceros, con estas licencias:'),
    h(
      'div',
      { class: 'list' },
      LICENSES.map((lic) => {
        const pre = h('pre', { hidden: true });
        const toggle = h('button', {
          class: 'link-row',
          'aria-expanded': 'false',
          onclick: async () => {
            const open = pre.hidden;
            if (open && !pre.textContent) pre.textContent = await fetch(lic.file).then((r) => r.text()).catch(() => '');
            pre.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
            toggle.firstChild.textContent = open ? 'Ocultar licencia' : 'Ver licencia';
          },
        }, h('span', {}, 'Ver licencia'));
        return h('div', { class: 'card settings-card license' }, h('h3', {}, lic.name), h('p', { class: 'caption' }, lic.detail), toggle, pre);
      }),
    ),
  );
}

// ---------- Misa ----------

function renderMass() {
  const plan = mass.current();
  const screen = $('mass');
  const header = h(
    'header',
    { class: 'screen-header' },
    h('h1', { class: 'large-title' }, 'Misa'),
    h('p', { class: 'subtitle' }, plan.dateIso ? `${M.formatHeaderDate(plan.dateIso)} · ${plan.community}` : plan.community),
  );
  const tabs = h(
    'div',
    { class: 'mass-tabs' },
    segmented(['Hoy', 'Próxima Misa'], ui.massTab === 'today' ? 0 : 1, (i) => {
      ui.massTab = i === 0 ? 'today' : 'next';
      renderMass();
    }, 'tab', 'Misas'),
  );
  screen.replaceChildren(header, tabs, ...[].concat(ui.massTab === 'today' ? todayList() : nextMass(plan)));
  if (ui.massTab === 'next') prepareCard(plan);
}

function todayList() {
  const history = M.sortByClosestDate(mass.history());
  if (history.length === 0) {
    return h(
      'div',
      { class: 'empty' },
      h('p', { class: 'title' }, 'Aún no hay Misas guardadas'),
      h('p', { class: 'subtitle' }, 'Al compartir una Misa, o al abrir un link de Misa, quedará aquí.'),
    );
  }
  const today = M.todayIso();
  return h(
    'div',
    { class: 'list' },
    history.map((plan) => {
      const lines = [];
      plan.slots.forEach((slot) => {
        const moment = M.MOMENTS.find((m) => m.code === slot.code);
        slot.songIds.forEach((id) => {
          const song = songsById.get(id);
          if (song) lines.push(`• ${moment.title}: ${song.title} (${song.displayNumber})`);
        });
      });
      const ids = plan.slots.flatMap((s) => s.songIds).filter((id) => songsById.has(id));
      return h(
        'div',
        { class: 'card today-wrap' },
        h(
          'button',
          {
            class: 'today-card',
            'aria-label': `Abrir los cantos de esta Misa: ${M.formatHeaderDate(plan.dateIso)}, ${plan.community}`,
            onclick: () => ids.length && push(`#/canto/${ids[0]}/0/${ids.join(',')}`),
          },
          h('div', { class: 'date' }, plan.dateIso === today ? 'Hoy' : M.formatHeaderDate(plan.dateIso)),
          h('div', { class: 'community' }, plan.community),
          lines.map((line) => h('div', { class: 'line' }, line)),
        ),
        h(
          'button',
          {
            class: 'delete',
            'aria-label': 'Eliminar esta Misa',
            onclick: async () => {
              if (await confirmDialog('¿Eliminar esta Misa?', `${M.formatHeaderDate(plan.dateIso)} · ${plan.community}`, 'Eliminar')) {
                mass.delete(plan.id);
                renderMass();
              }
            },
          },
          icon('delete'),
        ),
      );
    }),
  );
}

function updatePlan(transform) {
  mass.saveCurrent(transform(mass.current()));
  renderMass();
}

function updateSlot(code, transform) {
  updatePlan((plan) => ({ ...plan, slots: plan.slots.map((s) => (s.code === code ? { ...s, songIds: transform(s.songIds) } : s)) }));
}

function nextMass(plan) {
  const dateInput = h('input', {
    type: 'date',
    value: plan.dateIso || M.nextSundayIso(),
    'aria-label': 'Cambiar la fecha',
    onclick: (e) => {
      try {
        e.target.showPicker?.();
      } catch {
        // Safari abre su selector solo.
      }
    },
    onchange: (e) => {
      if (M.parseDate(e.target.value)) updatePlan((p) => ({ ...p, dateIso: e.target.value }));
    },
  });
  const info = h(
    'div',
    { class: 'group' },
    h(
      'div',
      { class: 'card', style: 'padding:4px 0' },
      h(
        'label',
        { class: 'info-row' },
        icon('calendar'),
        h('span', { class: 'text' }, h('span', { class: 'caption', style: 'display:block' }, 'Fecha'), h('span', {}, plan.dateIso ? M.formatHeaderDate(plan.dateIso) : 'Elegir fecha')),
        h('span', { class: 'chev' }, icon('chevron-right')),
        dateInput,
      ),
      h('div', { class: 'divider' }),
      h(
        'button',
        {
          class: 'info-row',
          'aria-label': `Cambiar la comunidad: ${plan.community}`,
          onclick: async () => {
            const value = await promptDialog('Comunidad o capilla', plan.community);
            if (value != null) {
              const community = value.trim().slice(0, M.MAX_COMMUNITY_LENGTH) || M.DEFAULT_COMMUNITY;
              updatePlan((p) => ({ ...p, community }));
            }
          },
        },
        icon('mass'),
        h('span', { class: 'text' }, h('span', { class: 'caption', style: 'display:block' }, 'Comunidad o capilla'), h('span', {}, plan.community)),
        h('span', { class: 'chev' }, icon('chevron-right')),
      ),
      h(
        'div',
        { style: 'padding:8px 16px' },
        h('button', {
          class: 'capsule-btn danger',
          disabled: M.totalSongs(plan) === 0 && !plan.dateIso,
          onclick: async () => {
            if (await confirmDialog('¿Limpiar la Próxima Misa?', 'Se quitarán la fecha y todos los cantos elegidos.', 'Limpiar')) {
              updatePlan((p) => ({ ...p, dateIso: '', slots: M.emptyPlan('').slots }));
            }
          },
        }, 'Limpiar'),
      ),
    ),
  );
  const moments = h(
    'div',
    { class: 'list', style: 'margin-top:8px' },
    M.MOMENTS.map((moment) => {
      const slot = plan.slots.find((s) => s.code === moment.code);
      const songs = slot.songIds.map((id, index) => [index, songsById.get(id)]).filter(([, s]) => s);
      const label = songs.length === 0 && moment.optional ? `${M.momentLabel(moment)} (Opcional)` : M.momentLabel(moment);
      const body =
        songs.length === 0
          ? h(
              'button',
              { class: 'choose', 'aria-label': `Elegir canto para ${moment.title}`, onclick: () => openPicker(moment) },
              h('span', {}, 'Elegir canto'),
              h('span', { class: 'plus' }, icon('add')),
            )
          : songs.map(([index, song], position) => [
              position > 0 ? h('div', { class: 'row-divider' }) : null,
              h(
                'div',
                { class: 'moment-song' },
                h('button', { class: 'open', onclick: () => openSong(song.id) }, h('span', { class: 'badge', 'aria-label': `Canto ${song.displayNumber}` }, song.displayNumber), h('span', { class: 'title' }, song.title)),
                h('button', {
                  class: 'more',
                  'aria-label': `Más opciones para ${song.title}`,
                  onclick: () =>
                    actionSheet([
                      { label: 'Cambiar canto', run: () => openPicker(moment, index) },
                      { label: 'Añadir otro canto a este momento', run: () => openPicker(moment) },
                      { label: 'Quitar', danger: true, run: () => updateSlot(moment.code, (ids) => ids.filter((_, i) => i !== index)) },
                    ]),
                }, icon('more-horiz')),
              ),
            ]);
      return h('div', { class: 'card' }, h('h2', { class: 'moment-label' }, label), body);
    }),
  );
  const share = h('button', { class: 'share-btn', id: 'share-btn', disabled: M.totalSongs(plan) === 0, onclick: () => shareMass() }, icon('share'), 'Generar ficha y compartir');
  return [info, moments, share];
}

/** La hoja para elegir el canto de un momento: primero su sección, con buscador; o todo el catálogo. */
function openPicker(moment, replaceIndex = null) {
  const section = categoryById.get(moment.categoryId);
  let showAll = !section;
  let query = '';
  const list = h('div', { class: 'sheet-list' });
  const toggle = section ? h('button', { class: 'capsule-btn toggle-all', onclick: () => ((showAll = !showAll), refresh()) }) : null;
  const input = h('input', {
    type: 'search',
    placeholder: 'Busca por número, título o letra',
    'aria-label': 'Busca por número, título o letra',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    oninput: (e) => ((query = e.target.value), refresh()),
  });
  const clear = h('button', { class: 'clear', 'aria-label': 'Borrar búsqueda', onclick: () => ((input.value = ''), (query = ''), refresh()) }, icon('close'));
  let close;
  const pick = (song) => {
    close();
    updateSlot(moment.code, (ids) => {
      if (replaceIndex == null) return ids.includes(song.id) ? ids : [...ids, song.id];
      return [...new Set(ids.map((id, i) => (i === replaceIndex ? song.id : id)))];
    });
  };
  function refresh() {
    const categoryId = showAll ? null : section?.id;
    const results = query.trim() ? search.search(query, categoryId) : catalog.songs.filter((s) => !categoryId || s.categoryId === categoryId);
    clear.hidden = !query;
    list.replaceChildren(
      results.length === 0 && query.trim()
        ? h('p', { class: 'subtitle', style: 'padding:16px var(--screen-padding)' }, `No hay cantos para «${query}»`)
        : h('div', { class: 'list', style: 'padding:0 var(--card-margin)' }, results.slice(0, 250).map((s) => songRow(s, { showCategory: showAll, onPick: pick, heart: false }))),
    );
    list.scrollTop = 0;
    if (toggle) toggle.textContent = showAll ? `Ver solo «${section.name}»` : `Ver todo el catálogo (${catalog.songs.length} cantos)`;
  }
  refresh();
  close = openSheet(
    h(
      'div',
      { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Elegir canto para ${moment.title}` },
      h('div', { class: 'grabber' }),
      h('div', { class: 'sheet-head' }, h('h2', { class: 'compact-title' }, moment.title), h('div', { class: 'search' }, icon('search'), input, clear)),
      list,
      toggle,
    ),
  );
}

// La ficha se dibuja apenas cambia la Misa: así, al tocar «Compartir», el iPhone abre su menú en el mismo toque.
let cardCache = { key: '', file: null, promise: null };
function shareTarget(plan) {
  return plan.dateIso ? plan : { ...plan, dateIso: M.nextSundayIso() };
}
function prepareCard(plan) {
  if (M.totalSongs(plan) === 0) return null;
  const target = shareTarget(plan);
  const key = `${target.dateIso}|${target.community}|${M.encodeSlots(target.slots)}`;
  if (cardCache.key !== key) {
    const promise = drawMassCard(target, songsById).then((blob) => {
      if (cardCache.key === key) cardCache.file = new File([blob], 'cantos_misa.png', { type: 'image/png' });
      return cardCache.file;
    });
    cardCache = { key, file: null, promise };
  }
  return cardCache;
}

async function shareMass() {
  const plan = mass.current();
  if (M.totalSongs(plan) === 0) return;
  const target = shareTarget(plan);
  mass.saveToHistory(target);
  const text = M.buildWhatsAppMessage(target);
  const cache = prepareCard(plan);
  const file = cache.file || (await cache.promise);
  try {
    if (navigator.canShare?.({ files: [file], text })) {
      await navigator.share({ files: [file], text });
    } else if (navigator.share) {
      await navigator.share({ text });
    } else {
      downloadFile(file);
      await navigator.clipboard?.writeText(text);
      toast('Se descargó la ficha y se copió el mensaje para pegarlo en WhatsApp.');
    }
  } catch (e) {
    if (e?.name !== 'AbortError') {
      downloadFile(file);
      toast('No se pudo abrir el menú de compartir: se descargó la ficha.');
    }
  }
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Un link de Misa abierto en el navegador: se guarda en «Hoy» y se muestra (como MainActivity en Android). */
function importMassLink(query) {
  const plan = M.parseQuery(query);
  ui.massTab = 'today';
  history.replaceState({ depth: 0 }, '', '#/misa');
  route();
  if (!plan) {
    toast('Este link de Misa no es válido');
    return;
  }
  mass.saveToHistory(plan);
  renderMass();
  toast(`Se cargaron los cantos del ${M.formatSpanishDate(plan.dateIso)}`);
}

// ---------- Hojas, diálogos y avisos ----------

const modals = [];
function openSheet(sheet, onClose) {
  const scrim = h('div', { class: 'scrim' });
  const previousFocus = document.activeElement;
  document.body.append(scrim, sheet);
  requestAnimationFrame(() => {
    scrim.classList.add('shown');
    sheet.classList.add('shown');
  });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    modals.splice(modals.indexOf(close), 1);
    scrim.classList.remove('shown');
    sheet.classList.remove('shown');
    setTimeout(() => {
      scrim.remove();
      sheet.remove();
    }, 300);
    previousFocus?.focus?.({ preventScroll: true });
    onClose?.();
  };
  scrim.addEventListener('click', close);
  modals.push(close);
  return close;
}
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modals.length) modals[modals.length - 1]();
});

function actionSheet(actions) {
  let close;
  const run = (fn) => () => {
    close();
    fn();
  };
  close = openSheet(
    h(
      'div',
      { class: 'sheet action-sheet', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'card' }, actions.map((a) => h('button', { class: a.danger ? 'danger' : '', onclick: run(a.run) }, a.label))),
      h('button', { class: 'cancel', onclick: () => close() }, 'Cancelar'),
    ),
  );
}

function dialog(build) {
  return new Promise((resolve) => {
    let result = null;
    let close;
    const done = (value) => {
      result = value;
      close();
    };
    const box = build(done);
    close = openSheet(box, () => resolve(result));
    box.querySelector('input, .actions button:last-child')?.focus();
  });
}

function confirmDialog(title, body, confirmLabel) {
  return dialog((done) =>
    h(
      'div',
      { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
      h('h2', {}, title),
      h('p', {}, body),
      h('div', { class: 'actions' }, h('button', { onclick: () => done(false) }, 'Cancelar'), h('button', { class: 'danger', onclick: () => done(true) }, confirmLabel)),
    ),
  ).then(Boolean);
}

function promptDialog(title, value) {
  return dialog((done) => {
    const input = h('input', { type: 'text', value, maxlength: M.MAX_COMMUNITY_LENGTH, autocapitalize: 'words', enterkeyhint: 'done', onkeydown: (e) => e.key === 'Enter' && done(input.value) });
    return h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('h2', {}, title),
      input,
      h('div', { class: 'actions' }, h('button', { onclick: () => done(null) }, 'Cancelar'), h('button', { onclick: () => done(input.value) }, 'Aceptar')),
    );
  });
}

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('shown'), 3500);
}

// ---------- Inicio de la app ----------

async function start() {
  applyAppearance();
  history.scrollRestoration = 'manual';
  catalog = await fetch('datos/cancionero_411.json').then((r) => r.json());
  songsById = new Map(catalog.songs.map((s) => [s.id, s]));
  categoryById = new Map(catalog.categories.map((c) => [c.id, c]));
  search = new SongSearch(catalog.songs);
  buildHome();
  buildReader();
  if (history.state == null) history.replaceState({ depth: 0 }, '', location.hash || '#/');
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();

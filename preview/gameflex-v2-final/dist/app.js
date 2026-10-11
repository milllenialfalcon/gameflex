/* GameFlex V2 — private static comparison preview.
   One script, one catalogue file. Nothing here changes a catalogue record; launch state is
   read from the current player-config.json and only an exact `iframe` entry is playable. */

const STATE = {
  games: [],
  launch: {},          // id -> { mode, reason }
  configLoaded: false,
  category: 'all',
  sort: 'featured',
  query: '',
  collection: null,    // { key, label, ids } when a collection page is open
  favourites: new Set(),
  recent: [],
  preview: null,       // catalogue preview block; presentation-only artwork map lives here
  route: { name: 'home' },
  paletteItems: [],
  paletteIndex: 0,
  lastFocus: null,
};

const FAVOURITES_KEY = 'gameflex:v2:favourites';
const RECENT_KEY = 'gameflex:v2:recent';
const RECENT_LIMIT = 12;
const PRODUCTION_V1 = 'https://gameflex.avirayex.chatgpt.site/';

const PALETTE_PLAYLIST = ['halo', 'bo1', 'quake3', 'surf', 'diablo', 'dos-doom-dec-1993', 'dos-road-rash', 'webxash', 'pes6', 'skate', 'simpsons', 'vicecity'];
const HERO_ART = {
  halo: 'assets/brand/halo-hero.webp',
  bo1: 'assets/refresh-bo1-hero.jpg',
  quake3: 'assets/brand/quake3-hero.webp',
  surf: 'assets/refresh-surf-hero.jpg',
  diablo: 'assets/refresh-diablo-hero.jpg',
  'dos-doom-dec-1993': 'assets/brand/dos-doom-dec-1993-hero.webp',
  'dos-road-rash': 'assets/brand/dos-road-rash-hero.webp',
};

const CATEGORY_LABEL = {
  shooters: 'Shooters', zombies: 'Zombies', sports: 'Sports', adventure: 'Adventure',
  strategy: 'Strategy', simulation: 'Simulation', racing: 'Racing', platformers: 'Platformers',
  puzzle: 'Puzzle', fighting: 'Fighting', rpg: 'RPG',
};
const CATEGORY_MARK = {
  shooters: '×', zombies: '†', sports: '●', adventure: '◆', strategy: '▲', simulation: '▮',
  racing: '»', platformers: '↑', puzzle: '?', fighting: '≠', rpg: '★',
};
const CATEGORY_BLURB = {
  shooters: 'Arena legends, alien invasions and the original headshots.',
  zombies: 'Board up, gear up, and try to make it to morning.',
  sports: 'Football, skateboarding and movement games with their own rules.',
  adventure: 'Open worlds, action RPGs and stories you click your way through.',
  strategy: 'Build, out-think and out-last the other side.',
  simulation: 'Run a city, a hospital or a whole little economy.',
  racing: 'Pedal down. Checkpoint by checkpoint.',
  platformers: 'Precision jumps, tight timing, one more go.',
  puzzle: 'Think it through. The clock is watching.',
  fighting: 'Two players, one health bar, no excuses.',
  rpg: 'Level up, loot everything, talk to everyone.',
};
const PROVIDER_LABEL = { 'dos-zone': 'DOS Zone' };
const PLATFORM_LABEL = { 'Desktop · Mobile': 'Desktop and mobile', 'Mobile · Desktop': 'Mobile and desktop' };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = value => String(value).padStart(2, '0');
const icon = (name, size = 18) => {
  const paths = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    back: '<path d="m15 5-7 7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    arrow: '<path d="M5 12h14m-5-6 6 6-6 6"/>',
  };
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
};

/* ------------------------------------------------------------------ storage */
function readIds(key, limit) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    const ids = Array.isArray(raw) ? raw.filter(id => typeof id === 'string') : [];
    return limit ? ids.slice(0, limit) : ids;
  } catch { return []; }
}
function writeIds(key, ids) {
  try { localStorage.setItem(key, JSON.stringify(ids)); return true; } catch { return false; }
}
function storageAvailable() {
  try { const probe = '__gameflex_v2__'; localStorage.setItem(probe, '1'); localStorage.removeItem(probe); return true; } catch { return false; }
}

/* --------------------------------------------------------- launch and state */
function launchFor(id) {
  const game = STATE.games.find(item => item.id === id);
  if (!game) return { mode: 'unknown', reason: 'That game is not in this preview collection.' };
  if (!STATE.configLoaded) return { mode: 'unknown', reason: 'The launch settings for this preview could not be read, so nothing can start here.' };
  if (game.availability === 'sandbox-pending') {
    return { mode: 'pending', reason: 'Sandbox integration is pending, so this preview keeps the record but does not start it here.' };
  }
  const entry = STATE.launch[id];
  if (!entry) return { mode: 'not-ready', reason: 'No launch entry in the current player settings, so this one is not player-ready yet.' };
  if (entry.mode === 'iframe') return { mode: 'iframe' };
  return { mode: 'not-ready', reason: typeof entry.reason === 'string' && entry.reason.trim() ? entry.reason.trim() : `Player settings list this one as "${entry.mode}", so it does not start here.` };
}
const isPlayable = id => launchFor(id).mode === 'iframe';
const playableCount = () => STATE.games.filter(game => isPlayable(game.id)).length;
const art = game => {
  const preview = STATE.preview && STATE.preview.artByGameId;
  const chosen = preview && typeof preview === 'object' ? preview[game.id] : null;
  return (typeof chosen === 'string' && chosen) || game.art || '';
};
const visibleGames = () => STATE.games.filter(game => !game.availability);
function categoryCount(key) {
  const pool = visibleGames();
  return key === 'all' ? pool.length : pool.filter(game => game.category === key).length;
}
function categoriesInUse() {
  const pool = visibleGames();
  return Object.keys(CATEGORY_LABEL).filter(key => pool.some(game => game.category === key))
    .sort((a, b) => categoryCount(b) - categoryCount(a) || CATEGORY_LABEL[a].localeCompare(CATEGORY_LABEL[b]));
}
function byId(id) { return STATE.games.find(game => game.id === id) || null; }

/* ---------------------------------------------------------------- rendering */
function stateChip(id) {
  const launch = launchFor(id);
  if (launch.mode === 'iframe') return '<span class="state playable">In-site player</span>';
  if (launch.mode === 'pending') return '<span class="state pending">Sandbox pending</span>';
  return '<span class="state">Not player-ready</span>';
}
function cardMarkup(game, { note = false } = {}) {
  const launch = launchFor(game.id);
  const favourite = STATE.favourites.has(game.id);
  const noteText = launch.mode === 'iframe' ? '' : (launch.reason || '');
  return `<article class="card" data-id="${escape(game.id)}">
    <button class="card-art" type="button" data-open="${escape(game.id)}" aria-label="${escape(game.title)} — open details">
      <img src="${escape(art(game))}" alt="" loading="lazy" decoding="async" width="460" height="259">
      ${stateChip(game.id)}
    </button>
    <button class="favourite" type="button" data-favourite="${escape(game.id)}" aria-pressed="${favourite}" aria-label="${favourite ? 'Remove' : 'Save'} ${escape(game.title)} ${favourite ? 'from' : 'to'} favourites">${icon('heart')}</button>
    <div class="card-body">
      <h3><button class="linkish" type="button" data-open="${escape(game.id)}">${escape(game.title)}</button></h3>
      <p class="card-meta">${escape(game.genre)} · ${escape(PLATFORM_LABEL[game.platform] || game.platform || 'Desktop')}</p>
      ${note && noteText ? `<p class="card-note">${escape(noteText)}</p>` : ''}
    </div>
  </article>`;
}
function filteredGames() {
  const query = STATE.query.trim().toLowerCase();
  let pool = STATE.collection ? STATE.collection.ids.map(byId).filter(Boolean) : STATE.games;
  if (STATE.category !== 'all') pool = pool.filter(game => game.category === STATE.category);
  if (query) {
    pool = pool.filter(game => `${game.title} ${game.genre} ${game.description || ''} ${(game.tags || []).join(' ')}`.toLowerCase().includes(query));
  }
  if (STATE.sort === 'az') pool = [...pool].sort((a, b) => a.title.localeCompare(b.title));
  if (STATE.sort === 'za') pool = [...pool].sort((a, b) => b.title.localeCompare(a.title));
  if (STATE.sort === 'featured') pool = [...pool].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || a.title.localeCompare(b.title));
  return pool;
}

function heroMarkup() {
  const pool = PALETTE_PLAYLIST.map(byId).filter(Boolean);
  const picks = pool.filter(game => launchFor(game.id).mode !== 'pending').slice(0, 5);
  const hero = picks.find(game => HERO_ART[game.id]) || picks[0];
  const heroArt = hero ? (HERO_ART[hero.id] || art(hero)) : 'assets/brand/quake3-hero.webp';
  const total = visibleGames().length;
  return `<section class="hero" aria-labelledby="hero-title">
    <div class="hero-media" aria-hidden="true"><img src="${escape(heroArt)}" alt="" width="1600" height="900" decoding="async"></div>
    <div class="hero-shade" aria-hidden="true"></div>
    <div class="wrap hero-inner">
      <div class="hero-copy">
        <p class="eyebrow">Curated browser games</p>
        <h1 id="hero-title">Your browser is the console.</h1>
        <p class="hero-lede">${total} verified games, ${playableCount()} ready to open inside the Gameflex player right here. Favourites stay in this browser. No account, no launcher, no detours.</p>
        <div class="hero-facts">
          <span class="chip lime">${total} games published</span>
          <span class="chip">${playableCount()} in-site player</span>
          <span class="chip">${STATE.games.length - total} sandbox pending</span>
        </div>
        ${hero ? `<div class="hero-actions">
          <button class="button lime" type="button" data-play="${escape(hero.id)}"${isPlayable(hero.id) ? '' : ' disabled'}>${icon('play', 16)} Launch ${escape(hero.title)}</button>
          <button class="button ghost" type="button" data-open="${escape(hero.id)}">Game details</button>
        </div>` : ''}
      </div>
      <aside class="hero-shelf" aria-labelledby="hero-shelf-title">
        <h2 id="hero-shelf-title">Tonight's shortlist</h2>
        <p class="note">Hand-picked from the published collection.</p>
        <ul>${picks.map(game => `<li><button class="hero-pick" type="button" data-open="${escape(game.id)}">
          <img src="${escape(art(game))}" alt="" loading="lazy" width="74" height="42"><span><b>${escape(game.title)}</b><small>${escape(game.genre)} · ${isPlayable(game.id) ? 'player ready' : 'not player-ready'}</small></span>
        </button></li>`).join('')}</ul>
      </aside>
    </div>
  </section>`;
}

function collectionsMarkup() {
  const cards = categoriesInUse().map(key => {
    const genres = [...new Set(visibleGames().filter(game => game.category === key).map(game => game.genre))];
    return `<button class="collection-card" type="button" data-collection="${escape(key)}">
      <span class="row"><span class="swatch" aria-hidden="true">${escape(CATEGORY_MARK[key] || '◆')}</span><strong>${escape(CATEGORY_LABEL[key])}</strong></span>
      <span class="genre-list">${escape(genres.slice(0, 4).join(' · '))}${genres.length > 4 ? ' …' : ''}</span>
      <span class="count">${categoryCount(key)} ${categoryCount(key) === 1 ? 'game' : 'games'}</span>
      <span class="see-all">See all ${icon('arrow', 15)}</span>
    </button>`;
  }).join('');
  return `<section class="collections wrap" aria-labelledby="collections-title">
    <div class="section-head">
      <div><p class="eyebrow muted">Browse the library</p><h2 id="collections-title">Collections</h2></div>
      <p class="library-head total">${categoriesInUse().length} collections · ${visibleGames().length} games</p>
    </div>
    <div class="collection-grid">${cards}</div>
  </section>`;
}

function shelvesMarkup() {
  const pool = visibleGames();
  const ready = pool.filter(game => isPlayable(game.id));
  const shelves = [
    { id: 'ready', title: 'Ready in the player', note: 'Launch state comes straight from the current player settings.', items: ready },
    { id: 'featured', title: 'Straight to the good stuff', note: 'The picks this collection leads with.', items: pool.filter(game => game.featured) },
    { id: 'dos', title: 'DOS Zone classics', note: 'Listed with full records. Sandbox integration is still on the way.', items: pool.filter(game => game.provider === 'dos-zone').slice(0, 12) },
    { id: 'recent', title: 'Pick up where you left off', note: 'Only what you actually opened in this browser.', items: STATE.recent.map(byId).filter(Boolean) },
  ].filter(shelf => shelf.items.length);
  return `<section class="shelves wrap" aria-labelledby="shelves-title">
    <h2 class="sr-only" id="shelves-title">Curated shelves</h2>
    ${shelves.map(shelf => `<section class="shelf" data-shelf="${shelf.id}" aria-labelledby="shelf-${shelf.id}">
      <div class="shelf-head">
        <div><h3 id="shelf-${shelf.id}">${escape(shelf.title)} <span class="count" style="color:var(--muted);font-size:13px;font-weight:400">${pad(shelf.items.length)}</span></h3><p>${escape(shelf.note)}</p></div>
        <div class="shelf-tools">
          <button class="icon-button" type="button" data-scroll="${shelf.id}" data-direction="-1" aria-label="Scroll ${escape(shelf.title)} back one game">‹</button>
          <button class="icon-button" type="button" data-scroll="${shelf.id}" data-direction="1" aria-label="Scroll ${escape(shelf.title)} forward one game">›</button>
        </div>
      </div>
      <div class="shelf-row" id="row-${shelf.id}" tabindex="0" role="region" aria-labelledby="shelf-${shelf.id}">${shelf.items.map(game => cardMarkup(game)).join('')}</div>
    </section>`).join('')}
  </section>`;
}

function libraryMarkup() {
  const filtered = filteredGames();
  const filters = ['all', ...categoriesInUse()].map(key => {
    const label = key === 'all' ? 'All games' : CATEGORY_LABEL[key];
    return `<button class="filter" type="button" data-category="${escape(key)}" aria-pressed="${STATE.category === key}">${escape(label)}<span class="count">${categoryCount(key)}</span></button>`;
  }).join('');
  const heading = STATE.collection ? STATE.collection.label : 'The whole collection';
  const sub = STATE.collection ? STATE.collection.note : 'Every published game, with its launch state shown honestly.';
  return `<section class="library wrap" id="library" aria-labelledby="library-title">
    <div class="library-head">
      <div>
        <p class="eyebrow muted">${STATE.collection ? 'Collection' : 'Library'}</p>
        <h2 id="library-title">${escape(heading)}</h2>
        <p class="total">${escape(sub)}</p>
      </div>
      <div>
        ${STATE.collection ? '<button class="button ghost" type="button" data-route="home">All collections</button>' : ''}
        <button class="button ghost" type="button" data-route="pending" ${STATE.games.length - visibleGames().length ? '' : 'hidden'}>Sandbox pending (${STATE.games.length - visibleGames().length})</button>
      </div>
    </div>
    <div class="toolbar">
      <div class="filters" role="group" aria-label="Filter by collection">${filters}</div>
      <span class="spacer"></span>
      <label class="select-wrap">Sort
        <select id="sort">
          <option value="featured">Featured first</option>
          <option value="az">Title A–Z</option>
          <option value="za">Title Z–A</option>
        </select>
      </label>
    </div>
    <p class="result-line" id="result-line" role="status" aria-live="polite"></p>
    <div class="grid" id="grid"></div>
    <div id="library-state"></div>
  </section>`;
}

function renderLibrary() {
  const filtered = filteredGames();
  const grid = $('#grid');
  const state = $('#library-state');
  if (!grid) return;
  const scope = STATE.collection ? STATE.collection.label : 'the collection';
  const asked = STATE.games.filter(game => (STATE.collection ? STATE.collection.ids.includes(game.id) : true) && !game.availability);
  const emptyCopy = STATE.query
    ? { title: 'No game matches that.', body: `Nothing in ${scope} matches “${STATE.query}”. Check the spelling, or clear the search and browse instead.`, action: 'Clear search', handler: 'clear-search' }
    : STATE.category !== 'all'
      ? { title: 'Nothing in this collection yet.', body: `No published game sits under ${CATEGORY_LABEL[STATE.category] || STATE.category} in ${scope}. Other collections are one click away.`, action: 'Show all games', handler: 'clear-filters' }
      : STATE.collection && STATE.collection.key === 'pending'
        ? { title: 'Nothing pending here.', body: 'Every listed game is currently published. Good news.', action: 'Back to the library', handler: 'route-home' }
        : { title: 'Nothing here yet.', body: 'This part of the library is empty right now.', action: 'Show all games', handler: 'clear-filters' };
  $('#result-line').innerHTML = filtered.length
    ? `Showing <b>${filtered.length}</b> of ${asked.length} ${asked.length === 1 ? 'game' : 'games'}${STATE.query ? ` matching “${escape(STATE.query)}”` : ''}${STATE.category !== 'all' ? ` in ${escape(CATEGORY_LABEL[STATE.category] || STATE.category)}` : ''}.`
    : '';
  grid.innerHTML = filtered.map(game => cardMarkup(game, { note: false })).join('');
  state.innerHTML = filtered.length ? '' : `<div class="empty" role="status">
    <span class="pixel-mark" aria-hidden="true">+ +</span>
    <h3>${escape(emptyCopy.title)}</h3>
    <p>${escape(emptyCopy.body)}</p>
    <button class="button lime" type="button" data-empty-action="${emptyCopy.handler}">${escape(emptyCopy.action)}</button>
  </div>`;
}

function renderHome() {
  $('#app-main').innerHTML = `${heroMarkup()}${collectionsMarkup()}${shelvesMarkup()}${libraryMarkup()}`;
  $('#sort').value = STATE.sort;
  renderLibrary();
}

function renderPending() {
  const pending = STATE.games.filter(game => game.availability);
  $('#app-main').innerHTML = `<section class="library wrap" aria-labelledby="pending-title">
    <div class="library-head">
      <div>
        <p class="eyebrow muted">Not playable here</p>
        <h2 id="pending-title">Sandbox pending</h2>
        <p class="total">Listed with a full record. Launch state is honest: these do not start in this preview.</p>
      </div>
      <button class="button ghost" type="button" data-route="home">Back to the library</button>
    </div>
    <div class="notice"><span class="pixel-mark" aria-hidden="true">i</span><div><strong>Why they are here</strong><p>Sandbox integration for these ${pending.length} records is still being verified, so there is no iframe launch and no external fallback. Their artwork, description, genre and requirements are shown so the library stays complete and comparable.</p></div></div>
    <div class="grid">${pending.map(game => cardMarkup(game, { note: true })).join('')}</div>
  </section>`;
}

function renderFavourites() {
  const saved = [...STATE.favourites].map(byId).filter(Boolean);
  $('#app-main').innerHTML = `<section class="library wrap" aria-labelledby="favourites-title">
    <div class="library-head">
      <div>
        <p class="eyebrow muted">On this device</p>
        <h2 id="favourites-title">Your favourites</h2>
        <p class="total">Saved in this browser only. Nothing is uploaded anywhere.</p>
      </div>
      <button class="button ghost" type="button" data-route="home">Back to the library</button>
    </div>
    ${saved.length ? `<div class="grid">${saved.map(game => cardMarkup(game, { note: true })).join('')}</div>` : `<div class="empty" role="status">
      <span class="pixel-mark" aria-hidden="true">♡</span>
      <h3>No favourites yet.</h3>
      <p>Tap the heart on any game and it lands here. Saved IDs live in this browser's local storage and nowhere else.</p>
      <button class="button lime" type="button" data-empty-action="route-home">Browse the library</button>
    </div>`}
  </section>`;
}

function renderRoute() {
  const route = STATE.route.name;
  if (route === 'home') renderHome();
  else if (route === 'pending') renderPending();
  else if (route === 'favourites') renderFavourites();
  else if (route === 'collection') {
    renderHome();
    const library = $('#library');
    library?.scrollIntoView({ behavior: 'auto', block: 'start' });
    $('#library-title')?.focus?.();
  }
  syncHeader();
  document.title = route === 'home' ? 'GameFlex V2 — preview' : `GameFlex V2 — ${route}`;
}

function syncHeader() {
  const savedCount = [...STATE.favourites].filter(id => byId(id)).length;
  $('#favourite-count').textContent = savedCount;
  $('#favourite-count').hidden = savedCount === 0;
  $('#nav-favourites-count').textContent = savedCount ? String(savedCount) : '';
  $$('[data-view]').forEach(button => {
    const active = button.dataset.view === STATE.route.name;
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
}

/* ------------------------------------------------------------------ details */
function openDetail(id) {
  const game = byId(id);
  if (!game) return;
  const launch = launchFor(game.id);
  const saved = STATE.favourites.has(game.id);
  const related = STATE.games.filter(item => item.id !== game.id && item.category === game.category && !item.availability).slice(0, 4);
  const host = (() => { try { return new URL(game.url).hostname; } catch { return 'not recorded'; } })();
  const primary = launch.mode === 'iframe'
    ? `<button class="button lime" type="button" data-play="${escape(game.id)}">${icon('play', 16)} Launch in the V2 player</button>`
    : `<button class="button ghost" type="button" disabled>Not playable here</button>`;
  $('#detail-content').innerHTML = `
    <div class="detail-hero"><img src="${escape(art(game))}" alt="" width="1200" height="514"></div>
    <div class="detail-head">
      <span class="eyebrow">${escape(game.tag || 'GAMEFLEX')}</span>
      <h2 id="detail-title">${escape(game.title)}</h2>
      <p class="meta">${escape(game.genre)} · ${escape(PLATFORM_LABEL[game.platform] || game.platform || 'Desktop')}</p>
    </div>
    <div class="detail-body">
      <div>
        <h3>About this game</h3>
        <p>${escape(game.description || 'No description recorded.')}</p>
        <h3 style="margin-top:20px">Before you launch</h3>
        <p>${escape(game.requirements || 'Runs in a desktop browser with keyboard and mouse.')}</p>
        <div class="detail-actions">
          ${primary}
          <button class="button ghost" type="button" data-favourite="${escape(game.id)}" aria-pressed="${saved}">${icon('heart', 16)} ${saved ? 'Saved' : 'Favourite'}</button>
        </div>
        <p class="detail-note" style="margin-top:18px">${launch.mode === 'iframe'
          ? `${escape(host)} · page checked ${escape(game.checkedAt || 'date not recorded')}. Launch mode is read from the current player settings. Opening it here proves the host page loaded — it is not a gameplay or compatibility claim.`
          : `Not launched from this preview. ${escape(launch.reason)}`}</p>
      </div>
      <aside class="facts">
        <h3>Record</h3>
        <dl>
          <dt>Collection</dt><dd>${escape(CATEGORY_LABEL[game.category] || game.category || 'not recorded')}</dd>
          <dt>Genre</dt><dd>${escape(game.genre || 'not recorded')}</dd>
          <dt>Platform</dt><dd>${escape(PLATFORM_LABEL[game.platform] || game.platform || 'Desktop')}</dd>
          <dt>Provider</dt><dd>${escape(game.provider ? (PROVIDER_LABEL[game.provider] || game.provider) : 'recorded destination')}</dd>
          ${game.ownFiles ? '<dt>Own files</dt><dd>Yes — you supply your own game files at the host prompt</dd>' : ''}
          <dt>Launch state</dt><dd>${launch.mode === 'iframe' ? 'iframe in-site player' : launch.mode === 'pending' ? 'sandbox pending' : 'not player-ready'}</dd>
          ${game.verificationLevel ? `<dt>Verification</dt><dd>${escape(game.verificationLevel)}</dd>` : ''}
          <dt>Checked</dt><dd>${escape(game.checkedAt || 'not recorded')}</dd>
        </dl>
        ${related.length ? `<div class="related" style="margin-top:18px"><h3>More like this</h3><ul>${related.map(item => `<li><button type="button" data-open="${escape(item.id)}"><img src="${escape(art(item))}" alt="" loading="lazy" width="66" height="38"><span><b>${escape(item.title)}</b><small>${escape(item.genre)}</small></span></button></li>`).join('')}</ul></div>` : ''}
      </aside>
    </div>`;
  const dialog = $('#detail');
  if (!dialog.open) { STATE.lastFocus = document.activeElement; dialog.showModal(); }
  $('#detail .detail-close')?.focus();
}

/* ------------------------------------------------------------------- player */
let playerWatcher = null;
function openPlayer(id) {
  const game = byId(id);
  if (!game) return;
  const launch = launchFor(game.id);
  STATE.lastFocus = document.activeElement;
  const root = $('#player');
  $('#player-title').textContent = game.title;
  $('#player-meta').textContent = `${game.genre} · ${PLATFORM_LABEL[game.platform] || game.platform || 'Desktop'}`;
  $('#player-requirements').textContent = game.requirements || 'Runs in a desktop browser with keyboard and mouse.';
  $('#player-status').textContent = '';
  $('#player-open-source').textContent = (() => { try { return new URL(game.url).hostname; } catch { return 'not recorded'; } })();
  $('#player-stage').innerHTML = '';
  if (launch.mode === 'iframe') {
    const frame = document.createElement('iframe');
    frame.className = 'player-frame';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-pointer-lock');
    frame.setAttribute('allow', 'fullscreen; autoplay; gamepad');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('loading', 'eager');
    frame.title = `${game.title} inside the Gameflex V2 player`;
    $('#player-stage').append(frame);
    setPlayerStatus(`Loading ${game.title}…`);
    let settled = false;
    const timer = setTimeout(() => { if (!settled) showPlayerFallback(game, 'timeout'); }, 22000);
    frame.addEventListener('load', () => {
      settled = true; clearTimeout(timer);
      setPlayerStatus(`${game.title} host page loaded. That confirms the page opened, not that the game itself is playable — control it here and check the notes if it stays blank.`);
    });
    frame.src = game.url;
    playerWatcher = () => { settled = true; clearTimeout(timer); };
    root.hidden = false;
    document.documentElement.classList.add('player-open');
    $('#player-close').focus();
    return;
  }
  showPlayerFallback(game, launch.mode);
  root.hidden = false;
  document.documentElement.classList.add('player-open');
  $('#player-close').focus();
}
function setPlayerStatus(message) { $('#player-status').textContent = message; }
function showPlayerFallback(game, mode) {
  const launch = launchFor(game.id);
  const label = mode === 'timeout' ? 'Frame denied or still blank' : launch.mode === 'pending' ? 'Sandbox pending' : 'Not player-ready';
  const body = mode === 'timeout'
    ? `${game.title} did not report a loaded page in time. Frames can stay blank when a destination refuses embedding or needs longer to start. There is no new-tab fallback here by design.`
    : launch.reason;
  $('#player-stage').innerHTML = `<div class="player-fallback">
    <span class="state ${mode === 'timeout' ? 'pending' : ''}">${escape(label)}</span>
    <h3>This one cannot start in the player</h3>
    <p>${escape(body)}</p>
    <div class="detail-actions">
      <button class="button ghost" type="button" data-player-close>Close the player</button>
    </div>
    <p class="detail-note" style="margin-top:16px">Recorded destination: ${escape((() => { try { return new URL(game.url).hostname; } catch { return 'not recorded'; } })())}. The V2 player never leaves this page to launch a game, and no new-tab fallback is offered.</p>
  </div>`;
  setPlayerStatus(`${game.title} is not playable inside the preview. ${body}`);
}
function closePlayer() {
  playerWatcher?.();
  playerWatcher = null;
  $('#player-stage').innerHTML = '';
  $('#player').hidden = true;
  document.documentElement.classList.remove('player-open');
  setPlayerStatus('');
  const target = STATE.lastFocus && STATE.lastFocus.isConnected ? STATE.lastFocus : null;
  if (target) target.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ palette */
function paletteSource() {
  const query = STATE.query.trim().toLowerCase();
  if (!query) {
    const pool = visibleGames();
    const ready = pool.filter(game => isPlayable(game.id)).slice(0, 5);
    const featured = pool.filter(game => game.featured && !isPlayable(game.id)).slice(0, 4);
    return [{ group: 'Ready to launch', items: ready }, { group: 'In the collection', items: featured }]
      .filter(group => group.items.length);
  }
  const hits = STATE.games.filter(game => `${game.title} ${game.genre} ${(game.tags || []).join(' ')}`.toLowerCase().includes(query));
  const ready = hits.filter(game => isPlayable(game.id));
  const other = hits.filter(game => !isPlayable(game.id));
  return [{ group: 'Ready to launch', items: ready }, { group: 'Not player-ready', items: other }].filter(group => group.items.length);
}
function paletteRender() {
  const groups = paletteSource();
  const flat = groups.flatMap(group => group.items);
  STATE.paletteItems = flat;
  if (STATE.paletteIndex >= flat.length) STATE.paletteIndex = Math.max(0, flat.length - 1);
  const list = $('#palette-list');
  if (!flat.length) {
    list.innerHTML = `<div class="palette-empty"><b>Nothing matches “${escape(STATE.query || '')}”.</b>Try another title, or press Escape to close and browse the collections instead.</div>`;
    return;
  }
  let index = -1;
  list.innerHTML = groups.map(group => `<p class="palette-foot" style="border:0;padding:10px 12px 4px;color:var(--lime)">${escape(group.group)} · ${group.items.length}</p>
    ${group.items.map(game => {
      index += 1;
      const launch = launchFor(game.id);
      const selected = index === STATE.paletteIndex;
      return `<button class="palette-item" type="button" role="option" id="palette-option-${index}" aria-selected="${selected}" data-palette-index="${index}" data-open="${escape(game.id)}">
        <img src="${escape(art(game))}" alt="" loading="lazy" width="74" height="42">
        <span class="label"><b>${escape(game.title)}</b><small>${escape(game.genre)} · ${launch.mode === 'iframe' ? 'player ready' : launch.mode === 'pending' ? 'sandbox pending' : 'not player-ready'}</small></span>
        ${launch.mode === 'iframe' ? `<span class="state playable">${icon('play', 12)}</span>` : ''}
      </button>`;
    }).join('')}`).join('');
  const selected = $(`#palette-option-${STATE.paletteIndex}`);
  selected?.scrollIntoView({ block: 'nearest' });
}
function openPalette() {
  STATE.lastFocus = document.activeElement;
  STATE.paletteIndex = 0;
  const palette = $('#palette');
  palette.hidden = false;
  const input = $('#palette-input');
  input.value = STATE.query;
  statePaletteInput();
  input.focus();
  input.select();
}
function closePalette() {
  $('#palette').hidden = true;
  const target = STATE.lastFocus && STATE.lastFocus.isConnected ? STATE.lastFocus : null;
  if (target) target.focus({ preventScroll: true });
}
function statePaletteInput() {
  STATE.query = $('#palette-input').value;
  STATE.paletteIndex = 0;
  paletteRender();
}
function choosePalette(index) {
  const game = STATE.paletteItems[index];
  if (!game) return;
  closePalette();
  if (isPlayable(game.id)) openPlayer(game.id); else openDetail(game.id);
}

/* ------------------------------------------------------------------- events */
function toggleFavourite(id) {
  if (STATE.favourites.has(id)) { STATE.favourites.delete(id); toast('Removed from your favourites'); }
  else { STATE.favourites.add(id); toast('Saved. Right where you left it.'); }
  if (!writeIds(FAVOURITES_KEY, [...STATE.favourites])) toast('Saved for this visit. Browser storage is unavailable.');
  syncHeader();
  $$('[data-favourite]').forEach(button => {
    if (button.dataset.favourite !== id) return;
    const saved = STATE.favourites.has(id);
    button.setAttribute('aria-pressed', String(saved));
    if (button.classList.contains('favourite')) button.setAttribute('aria-label', `${saved ? 'Remove' : 'Save'} ${byId(id)?.title || 'game'} ${saved ? 'from' : 'to'} favourites`);
    else button.innerHTML = `${icon('heart', 16)} ${saved ? 'Saved' : 'Favourite'}`;
  });
  if (STATE.route.name === 'favourites') renderRoute();
}
function noteRecent(id) {
  STATE.recent = [id, ...STATE.recent.filter(item => item !== id)].slice(0, RECENT_LIMIT);
  writeIds(RECENT_KEY, STATE.recent);
}
let toastTimer = 0;
function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('visible'), 2600);
}
function setCategory(key) {
  STATE.category = key;
  STATE.query = '';
  const paletteInput = $('#palette-input');
  if (paletteInput) paletteInput.value = '';
  $$('[data-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === key)));
  renderLibrary();
}
function openCollection(key) {
  if (key === 'pending') { STATE.route = { name: 'pending' }; STATE.collection = null; renderRoute(); return; }
  if (key === 'favourites') { STATE.route = { name: 'favourites' }; STATE.collection = null; renderRoute(); return; }
  STATE.collection = { key, label: CATEGORY_LABEL[key] || key, note: CATEGORY_BLURB[key] || '', ids: visibleGames().filter(game => game.category === key).map(game => game.id) };
  STATE.category = 'all';
  STATE.route = { name: 'collection' };
  renderRoute();
}
function goHome() {
  STATE.collection = null;
  STATE.route = { name: 'home' };
  STATE.category = 'all';
  STATE.query = '';
  renderRoute();
  window.scrollTo({ top: 0 });
}
function stepShelf(row, direction) {
  if (!row) return;
  const card = row.querySelector('.card');
  const step = card ? card.getBoundingClientRect().width + 20 : row.clientWidth * 0.8;
  row.scrollBy({ left: step * direction, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

document.addEventListener('click', event => {
  const play = event.target.closest('[data-play]');
  if (play && !play.disabled) { noteRecent(play.dataset.play); return openPlayer(play.dataset.play); }
  const open = event.target.closest('[data-open]');
  if (open) return openDetail(open.dataset.open);
  const favourite = event.target.closest('[data-favourite]');
  if (favourite) return toggleFavourite(favourite.dataset.favourite);
  const collection = event.target.closest('[data-collection]');
  if (collection) return openCollection(collection.dataset.collection);
  const category = event.target.closest('[data-category]');
  if (category) return setCategory(category.dataset.category);
  const view = event.target.closest('[data-view]');
  if (view) return openCollection(view.dataset.view);
  const route = event.target.closest('[data-route]');
  if (route) return goHome();
  const emptyAction = event.target.closest('[data-empty-action]');
  if (emptyAction) {
    if (emptyAction.dataset.emptyAction === 'clear-search') { STATE.query = ''; $('#palette-input').value = ''; }
    if (emptyAction.dataset.emptyAction === 'clear-filters') { STATE.query = ''; STATE.category = 'all'; }
    if (emptyAction.dataset.emptyAction === 'route-home') return goHome();
    if (STATE.route.name !== 'home') renderRoute(); else { $$('[data-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === 'all'))); renderLibrary(); }
    return;
  }
  const scroll = event.target.closest('[data-scroll]');
  if (scroll) return stepShelf($(`#row-${scroll.dataset.scroll}`), Number(scroll.dataset.direction));
  const palette = event.target.closest('[data-palette-index]');
  if (palette) return choosePalette(Number(palette.dataset.paletteIndex));
  if (event.target.closest('[data-player-close]')) return closePlayer();
  if (event.target.closest('#player-close')) return closePlayer();
  if (event.target.closest('#search-trigger')) return openPalette();
  if (event.target.closest('#palette-close')) return closePalette();
  if (event.target === $('#palette')) return closePalette();
  if (event.target.closest('#detail .detail-close')) return $('#detail').close();
  if (event.target.closest('.wordmark')) return goHome();
});

$('#detail')?.addEventListener('click', event => {
  const dialog = $('#detail');
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
$('#detail')?.addEventListener('close', () => {
  const target = STATE.lastFocus && STATE.lastFocus.isConnected ? STATE.lastFocus : null;
  if (target) target.focus({ preventScroll: true });
});

$('#palette-input')?.addEventListener('input', statePaletteInput);
$('#sort')?.addEventListener('change', event => { STATE.sort = event.target.value; renderLibrary(); });
$('#palette')?.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const total = STATE.paletteItems.length;
    if (!total) return;
    STATE.paletteIndex = (STATE.paletteIndex + (event.key === 'ArrowDown' ? 1 : -1) + total) % total;
    paletteRender();
    return;
  }
  if (event.key === 'Enter') { event.preventDefault(); choosePalette(STATE.paletteIndex); return; }
  if (event.key === 'Escape') { event.preventDefault(); closePalette(); }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!$('#palette').hidden) return;
    if ($('#player').hidden === false) { event.preventDefault(); closePlayer(); }
    return;
  }
  if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key === '/') {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    event.preventDefault();
    return openPalette();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    return openPalette();
  }
  if ($('#palette').hidden || event.target !== $('#palette-input')) return;
});

window.addEventListener('storage', event => {
  if (event.key === FAVOURITES_KEY) { STATE.favourites = new Set(readIds(FAVOURITES_KEY)); syncHeader(); }
  if (event.key === RECENT_KEY) STATE.recent = readIds(RECENT_KEY, RECENT_LIMIT);
});

/* --------------------------------------------------------------------- init */
async function init() {
  STATE.favourites = new Set(readIds(FAVOURITES_KEY));
  STATE.recent = readIds(RECENT_KEY, RECENT_LIMIT);
  if (!storageAvailable()) toast('Browser storage is unavailable, so favourites last for this visit only.');
  $('#favourites-note').hidden = false;
  try {
    const response = await fetch('catalogue.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('catalogue unavailable');
    const data = await response.json();
    if (!data || !Array.isArray(data.games)) throw new Error('catalogue malformed');
    STATE.games = data.games;
    STATE.preview = data.preview;
  } catch {
    $('#app-main').innerHTML = `<div class="wrap" style="padding:60px 0"><div class="empty"><span class="pixel-mark" aria-hidden="true">!</span><h3>The preview catalogue could not load.</h3><p>catalogue.json is missing or unreadable, so nothing can be listed. Reload the page to try again.</p><button class="button lime" type="button" onclick="location.reload()">Reload</button></div></div>`;
    return;
  }
  try {
    const response = await fetch('player-config.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('player config unavailable');
    const config = await response.json();
    if (!config || typeof config.games !== 'object' || config.games === null) throw new Error('player config malformed');
    STATE.launch = config.games;
    STATE.configLoaded = true;
  } catch { STATE.configLoaded = false; }
  renderRoute();
  if (!STATE.configLoaded) toast('Launch settings could not be read, so every game is shown as not player-ready.');
}

init();

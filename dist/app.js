import { initPlayer, openPlayer, isPlayerOpen, syncPlayerFavourite, gameMode } from './player.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const icons = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
};
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// spotlight.html shares this script and marks itself with page-spotlight on <html>. The
// homepage keeps its current hero untouched: only that class unlocks the new-page pieces.
const spotlightPage = document.documentElement.classList.contains('page-spotlight');
let games = [], category = 'all', view = 'discover', search = '', toastTimer;
let favourites = new Set();
// Set on the spotlight page only, once its browse module has loaded.
let discovery = null;
// Set on the spotlight page only, from spotlight-media.json (artwork worker output). Keyed by
// game id; an absent file or entry just means the catalogue's own hero art stands.
let spotlightMedia = null;
// Set on the spotlight page only, from spotlight-portraits.json (artwork worker output). Keyed
// by game id and holding one real portrait poster per ranked Top game; an absent file or entry
// falls back to the catalogue's own landscape artwork.
let spotlightPortraits = null;
try { const stored = JSON.parse(localStorage.getItem('gameflex:favourites') || '[]'); if (Array.isArray(stored)) favourites = new Set(stored.filter(id => typeof id === 'string')); } catch { /* Browsing still works when storage is unavailable. */ }
const sections = [
  { id:'top', title:'Straight to the good stuff', subtitle:'A few classics to get you started.', match:g => g.featured },
  { id:'dos-zone', title:'DOS Zone', subtitle:'Original classics. Sandbox integration is on the way.', match:g => g.provider === 'dos-zone' },
  { id:'zombies', title:'One more round', subtitle:'Board up. Gear up. Try to make it to morning.', match:g => g.category === 'zombies' },
  { id:'shooters', title:'The classics hit different', subtitle:'Arena legends, alien invasions, and the original headshots.', match:g => g.category === 'shooters' },
  { id:'other', title:'Change the pace', subtitle:'Step away from the crosshair for a minute.', match:g => !['shooters','zombies'].includes(g.category) },
];
function storageSave() {
  try { localStorage.setItem('gameflex:favourites', JSON.stringify([...favourites])); return true; } catch { return false; }
}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2700); }
function syncHearts() {
  $('#favourite-count').textContent = games.filter(g => favourites.has(g.id)).length;
  document.querySelectorAll('[data-favourite]').forEach(button => {
    const saved = favourites.has(button.dataset.favourite), game = games.find(g => g.id === button.dataset.favourite);
    button.classList.toggle('saved', saved); button.setAttribute('aria-pressed', String(saved));
    button.setAttribute('aria-label', `${saved ? 'Remove' : 'Save'} ${game?.title || 'game'}${saved ? ' from' : ' to'} favourites`);
  });
  syncPlayerFavourite();
}
function toggleFavourite(id) {
  if (favourites.has(id)) { favourites.delete(id); toast('Removed from your favourites'); } else { favourites.add(id); toast('Saved. Your next session is sorted.'); }
  if (!storageSave()) toast('Saved for this visit. Browser storage is unavailable.');
  if (view === 'favourites') render();
  syncHearts();
}
function art(game, className = '') {
  return game.art ? `<img class="${className} ${game.artFit === 'contain' ? 'cover-contain' : ''}" src="${escape(game.art)}" alt="" loading="lazy" width="460" height="215">` : `<div class="art-fallback ${className}" style="--cover:${escape(game.color || '#37452b')}"><span class="fallback-icon" aria-hidden="true">${escape(game.symbol || '+')}</span><span class="fallback-title">${escape(game.title)}</span></div>`;
}
function card(game) {
  const title = escape(game.title), id = escape(game.id), href = `#play/${id}`;
  const playable = gameMode(game.id).mode === 'iframe';
  return `<article class="game-card"><a class="game-art" href="${href}" data-play="${id}" aria-label="${playable ? `Play ${title} in the gameflex player` : `Open ${title} — not playable in the gameflex player`}">${art(game)}<span class="card-tag">${escape(game.tag)}</span><span class="play-hover"><span>${playable ? 'Play in gameflex' : 'Not playable here'}</span></span></a><button class="heart" data-favourite="${id}" aria-pressed="false" aria-label="Save ${title} to favourites">${icons.heart}</button><div class="card-title-row"><a href="${href}" data-play="${id}">${title}</a><button class="info-button" data-details="${id}" aria-label="Details for ${title}">ⓘ</button></div><p class="card-meta"><span>${escape(game.genre)}</span><span class="dot"></span><span>${escape(game.platform || 'Desktop')}</span>${game.ownFiles ? '<span class="dot"></span><span class="file-tag">Own files</span>' : ''}</p>${game.availability === 'sandbox-pending' ? '<p class="pending-label">Sandbox pending</p>' : ''}</article>`;
}
function shelf(section, items) {
  return `<section class="shelf" aria-labelledby="heading-${section.id}"><div class="shelf-heading"><div><h3 id="heading-${section.id}">${escape(section.title)} <small>${items.length.toString().padStart(2,'0')}</small></h3>${section.subtitle ? `<p class="shelf-subtitle">${escape(section.subtitle)}</p>` : ''}</div><div class="shelf-controls"><button class="shelf-arrow" data-scroll="${section.id}" data-direction="-1" aria-label="Scroll ${escape(section.title)} left by one game">‹</button><button class="shelf-arrow" data-scroll="${section.id}" data-direction="1" aria-label="Scroll ${escape(section.title)} right by one game">›</button></div></div><div class="game-row" id="row-${section.id}" tabindex="0" role="region" aria-labelledby="heading-${section.id}">${items.map(card).join('')}</div></section>`;
}
function filteredGames() { return games.filter(g => (view !== 'favourites' || favourites.has(g.id)) && (category === 'all' || g.category === category) && `${g.title} ${g.genre} ${g.description} ${g.tags?.join(' ') || ''}`.toLowerCase().includes(search.toLowerCase())); }
function render() {
  const filtered = filteredGames(), isBrowse = view === 'discover' && category === 'all' && !search;
  $('#hero').hidden = view !== 'discover' || !!search;
  $('#catalogue-heading').innerHTML = view === 'favourites' ? 'Your next session<span class="lime-text">.</span>' : search ? 'Search results<span class="lime-text">.</span>' : 'Find your kind of fun<span class="lime-text">.</span>';
  $('#collection-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'game' : 'games'}${view === 'favourites' ? ' saved' : ' to explore'}`;
  $('#results').textContent = `${filtered.length} games${search ? ` matching ${search}` : ''}`;
  $('#shelves').innerHTML = isBrowse ? sections.map(s => { const items = filtered.filter(s.match); return items.length && (s.id !== 'zombies' || items.length > 1) ? shelf(s, items) : ''; }).join('') : filtered.length ? shelf({id:'results',title:view === 'favourites' ? 'Saved for a good time' : category === 'all' ? 'The collection' : $('.filter.active').textContent,subtitle: view === 'favourites' ? 'All your favourites. Right where you left them.' : ''}, filtered) : '';
  // Spotlight page only: the browse module owns the curated shelves and the result grid. The
  // homepage keeps the markup computed above, byte for byte.
  if (spotlightPage && discovery) $('#shelves').innerHTML = discovery.render({ isBrowse, filtered, view, category });
  $('#empty-state').hidden = filtered.length > 0;
  $('#empty-heading').textContent = search ? 'No games found.' : view === 'favourites' ? 'Your favourites start here.' : 'Nothing in this lane. Yet.';
  $('#empty-copy').textContent = search ? `No matches for “${search}”. Try another title or reset the filters.` : view === 'favourites' ? 'Tap the heart on any game to save it for later. We’ll keep your picks right here in this browser.' : 'No verified games match these filters. Explore the rest of the collection.';
  $('#surprise').disabled = filtered.length === 0;
  syncHearts(); updateArrows();
  document.querySelectorAll('.game-row').forEach(row => row.addEventListener('scroll', updateArrows, {passive:true}));
}
function updateArrows() {
  document.querySelectorAll('[data-scroll]').forEach(button => {
    const row = document.getElementById(`row-${button.dataset.scroll}`); if (!row) return;
    button.disabled = Number(button.dataset.direction) < 0 ? row.scrollLeft < 5 : row.scrollLeft >= row.scrollWidth - row.clientWidth - 5;
  });
}
const shelfTargets = new WeakMap();
function stepShelf(row, direction) {
  const card = row.querySelector('.game-card');
  if (!card) return;
  const step = card.getBoundingClientRect().width + (parseFloat(getComputedStyle(row).columnGap) || 0);
  const maximum = Math.max(0, row.scrollWidth - row.clientWidth);
  const previous = shelfTargets.get(row);
  const origin = previous?.moving ? previous.target : row.scrollLeft;
  const target = Math.max(0, Math.min(maximum, (Math.round(origin / step) + direction) * step));
  clearTimeout(previous?.timer);
  const state = { target, moving: true };
  state.timer = setTimeout(() => { state.moving = false; }, 650);
  shelfTargets.set(row, state);
  row.scrollTo({ left: target, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
// Hero carousel. Slides are the games the catalogue marks as spotlight or featured.
// Artwork prefers an optional heroArt (wide crop) and falls back to art. Only a string is
// accepted, so a malformed catalogue field can never reach `art.replace` in paintHero and
// blank the whole hero. An unusable value falls through to the next option, then to ''.
// The homepage keeps the catalogue's deterministic order. The spotlight page reshuffles the
// same set on every load (Fisher–Yates) and never opens on the game it opened on last
// refresh, so a repeat visit shows a different game first.
const hero = { slides: [], index: 0 };
const heroPad = value => String(value).padStart(2, '0');
const heroArtOf = game => [game.heroArt, game.art].find(value => typeof value === 'string' && value !== '') || '';
const HERO_OPENING_KEY = 'gameflex:spotlight-opening';
// Fisher–Yates over a copy: the shared catalogue array handed to `games` is never reordered.
function shuffleSlides(slides) {
  const copy = slides.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = copy[i]; copy[i] = copy[j]; copy[j] = swap;
  }
  let previous = '';
  try { previous = sessionStorage.getItem(HERO_OPENING_KEY) || ''; } catch { /* sessionStorage may be blocked; the shuffle still runs. */ }
  if (copy.length > 1 && previous && copy[0].id === previous) {
    const target = 1 + Math.floor(Math.random() * (copy.length - 1));
    const swap = copy[0]; copy[0] = copy[target]; copy[target] = swap;
  }
  try { sessionStorage.setItem(HERO_OPENING_KEY, copy[0]?.id || ''); } catch { /* ignore */ }
  return copy;
}
// Spotlight page only. spotlight-media.json maps a game id to {src, position, sourceUrl,
// width, height}. Each slide gets a shallow clone so overriding heroArt/heroPosition never
// reaches the shared catalogue entry. The artwork worker writes this file, so it is treated as
// untrusted: a missing file, a non-object or array root, a missing entry, and each malformed
// field all fall back to the catalogue art instead of throwing and taking the catalogue down
// with it. Only `src` paths under the local assets/ directory are honoured.
const isLocalArtPath = value => typeof value === 'string'
  && value.startsWith('assets/')
  && !value.includes('..') && !value.includes('\\') && !value.includes('://');
// Plain, non-array objects only: a number, string, null or array entry is malformed.
const isMediaEntry = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
async function loadSpotlightMedia() {
  if (!spotlightPage) return null;
  try {
    const response = await fetch('spotlight-media.json');
    if (!response.ok) return null;
    const data = await response.json();
    return isMediaEntry(data) ? data : null;
  } catch { return null; }
}
// The entry for one game, or null when the map or entry is malformed. Own properties only, so
// inherited names ('constructor', '__proto__') cannot pose as game ids.
function mediaEntryFor(id) {
  if (!isMediaEntry(spotlightMedia)) return null;
  if (!Object.prototype.hasOwnProperty.call(spotlightMedia, id)) return null;
  const entry = spotlightMedia[id];
  return isMediaEntry(entry) ? entry : null;
}
// Spotlight page only. spotlight-portraits.json maps a game id to {src, sourceUrl, width,
// height}: the artwork worker's real portrait poster for a ranked Top game. It gets the same
// untrusted treatment as the media map — a missing file, a non-object root, a missing entry and
// each malformed field all fall back to the catalogue's own artwork instead of throwing. Only
// `src` paths under the local assets/ directory are honoured.
async function loadSpotlightPortraits() {
  if (!spotlightPage) return null;
  try {
    const response = await fetch('spotlight-portraits.json');
    if (!response.ok) return null;
    const data = await response.json();
    return isMediaEntry(data) ? data : null;
  } catch { return null; }
}
// The portrait src for one game, or '' when the map or entry is malformed, the game is absent,
// or the path is not a local asset. Own properties only, so inherited names cannot pose as ids.
function portraitSrcFor(id) {
  if (!isMediaEntry(spotlightPortraits)) return '';
  if (!Object.prototype.hasOwnProperty.call(spotlightPortraits, id)) return '';
  const entry = spotlightPortraits[id];
  if (!isMediaEntry(entry)) return '';
  return isLocalArtPath(entry.src) ? entry.src : '';
}
// Spotlight page only: the quality-curated hero pool. The artwork worker's media map is the
// source of truth for which featured games carry authentic, high-quality local artwork, so a
// featured game stays in the hero only when the map holds an entry whose `src` is a usable
// local assets/ path. When the map is absent, malformed, or supplies fewer than six such
// featured games, the hero drops back to the full catalogue featured list rather than run a
// thin rotation. Range check only — the games themselves stay listed in the catalogue.
const HERO_MIN_CURATED = 6;
function curatedHeroPool(featured) {
  const curated = featured.filter(game => {
    const media = mediaEntryFor(game.id);
    return Boolean(media) && isLocalArtPath(media.src);
  });
  return curated.length >= HERO_MIN_CURATED ? curated : featured;
}

// The promotional slide, spotlight page only. It is not a catalogue game: it carries brand copy,
// a CSS collage built from artwork already shipped in assets/, and a single call to action that
// scrolls to the catalogue. It never names a game and it never reaches the player. It is spliced
// into the shuffled hero pool at a fresh random point on every load, so it reappears somewhere
// new each refresh, and the up-next strip skips it so at least five real games stay previewed.
const BRAND_ID = 'gameflex-promo';
// Two-part headlines in the original promo's voice: a fixed "Old favourites." opener with a short
// second line that rotates. Kept here as one list so the wording is easy to tune.
const BRAND_HEADLINES = ['New tab.', 'Right here.', 'No installs.', 'No extra tabs.', 'One click.', 'Back in frame.', 'One more go.'];
// Existing local artwork only: six landscape covers laid out as a 3x2 collage under the hero
// shade. No new image is fetched or generated for the brand slide.
const BRAND_COLLAGE = ['assets/quake.jpg', 'assets/halo.jpg', 'assets/bo1.jpg', 'assets/cs.jpg', 'assets/quake2.jpg', 'assets/quake3.jpg'];
const BRAND_TILE_POSITION = ['0% 0%', '50% 0%', '100% 0%', '0% 100%', '50% 100%', '100% 100%'];
const brandSlide = () => ({
  id: BRAND_ID, brand: true, title: 'GAMEFLEX', tag: 'THE BROWSER IS YOUR CONSOLE',
  genre: 'Curated classics · Zero launchers',
  description: 'The games you grew up on. A few you missed. They open right here inside gameflex.',
  requirements: 'Some ports need your original game files. No installs. No extra tabs.',
  // A real local cover for the up-next strip and the progress pills. The on-slide backdrop is the
  // collage below, so this is only used by the thumbnail layer.
  heroArt: BRAND_COLLAGE[0],
});
// Rotates on each appearance rather than on a timer, so the same slide never reads the same twice
// in a row and nothing on the page changes without a slide change.
let brandHeadlineIndex = Math.floor(Math.random() * BRAND_HEADLINES.length);
const nextBrandHeadline = () => {
  brandHeadlineIndex = (brandHeadlineIndex + 1) % BRAND_HEADLINES.length;
  return `Old favourites. ${BRAND_HEADLINES[brandHeadlineIndex]}`;
};
// Appends the promotional slide to an already-shuffled pool. The pool is copied first, so the
// caller's array is untouched. It is deliberately the last slide: the brand promo must never be
// the very first thing a visitor sees, and keeping it off the front leaves the opener (and the
// five up-next previews that follow it) a genuine game. The games themselves are reshuffled on
// every load, so the promo still lands in a different context each refresh.
function withBrandSlide(slides) {
  const pool = slides.slice();
  pool.push(brandSlide());
  return pool;
}

// Listeners let spotlight.mjs restart its own 7-second countdown after a manual change,
// without this file knowing anything about autoplay.
const heroListeners = new Set();
const onHeroChange = listener => { heroListeners.add(listener); return () => heroListeners.delete(listener); };
function heroAnnounce() {
  const game = hero.slides[hero.index], status = $('#hero-status');
  if (status) status.textContent = game ? `Spotlight ${hero.index + 1} of ${hero.slides.length}: ${game.title}` : '';
}
function paintHero(announce = true) {
  const game = hero.slides[hero.index];
  if (!game) return;
  const image = $('#hero-image');
  if (spotlightPage && game.brand) {
    // Brand slide: a 3x2 collage of existing local covers instead of one game image. The tiles
    // are offset so the hero shade and lime glow read on top of them.
    image.style.backgroundImage = BRAND_COLLAGE.map(source => `url("${source}")`).join(', ');
    // '33.34% auto' keeps the 16:9 tiles at their own aspect ratio instead of stretching each
    // into a tall rectangle; the positions and no-repeat below still tile them 3x2, and the
    // game-slide branch clears these values so the stylesheet's single cover is restored.
    image.style.backgroundSize = BRAND_COLLAGE.map(() => '33.34% auto').join(', ');
    image.style.backgroundPosition = BRAND_TILE_POSITION.join(', ');
    image.style.backgroundRepeat = BRAND_COLLAGE.map(() => 'no-repeat').join(', ');
    image.classList.remove('hero-image-empty');
  } else {
    const art = heroArtOf(game);
    image.style.backgroundImage = art ? `url("${art.replace(/["\\]/g, '\\$&')}")` : 'none';
    // Clearing the collage-only inline values restores the stylesheet's single cover image, so a
    // game slide that follows the brand slide is never left tiled or letterboxed.
    image.style.backgroundSize = '';
    image.style.backgroundRepeat = '';
    image.classList.toggle('hero-image-empty', !art);
  }
  // Per-game crop point from spotlight-media.json. Homepage slides never carry a position,
  // and the branch is spotlight-only, so the baseline hero keeps its CSS background-position.
  // The same branch stamps data-hero-game with the live game id, so QA can read the game the
  // spotlight is actually showing (the homepage DOM is untouched).
  if (spotlightPage) {
    if (!game.brand) image.style.backgroundPosition = game.heroPosition || '';
    image.setAttribute('data-hero-game', game.id);
  }
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    image.classList.remove('hero-fade');
    void image.offsetWidth;
    image.classList.add('hero-fade');
  }
  $('#spotlight-name').textContent = game.brand ? nextBrandHeadline() : game.title;
  const tag = $('#spotlight-tag'); if (tag) tag.textContent = game.tag || 'IN THE SPOTLIGHT';
  const genre = $('#spotlight-genre');
  if (genre) {
    // The brand slide is not a game: it shows its own line and never the platform fallback.
    genre.textContent = game.brand ? game.genre : [game.genre, game.availability === 'sandbox-pending' ? 'Sandbox pending' : (game.platform || 'Desktop')].filter(Boolean).join(' · ');
  }
  $('#spotlight-description').textContent = game.description || '';
  $('#spotlight-requirements').textContent = game.requirements || '';
  document.querySelectorAll('[data-hero-index]').forEach((dot, index) => {
    const active = index === hero.index;
    dot.classList.toggle('active', active);
    if (active) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current');
    dot.tabIndex = active ? 0 : -1;
  });
  const indexCurrent = $('#hero-index-current'); if (indexCurrent) indexCurrent.textContent = heroPad(hero.index + 1);
  const indexTotal = $('#hero-index-total'); if (indexTotal) indexTotal.textContent = heroPad(hero.slides.length);
  const single = hero.slides.length < 2;
  $('#hero-prev').disabled = single; $('#hero-next').disabled = single;
  $('#hero-play').disabled = false;
  if (game.brand) {
    // The brand slide's call to action scrolls to the catalogue; it never names a game and never
    // opens the player, so there is no fake route behind it.
    $('#hero-play').setAttribute('aria-label', 'Scroll to the game collection');
    $('#hero-play').lastChild.textContent = 'Show me the games';
  } else {
    $('#hero-play').setAttribute('aria-label', `Open ${game.title} in the Gameflex player`);
    $('#hero-play').lastChild.textContent = game.availability === 'sandbox-pending' ? 'View game' : "Let's play";
  }
  const activeDot = document.querySelector(`[data-hero-index="${hero.index}"]`);
  if (activeDot) {
    const dots = activeDot.parentElement;
    dots.scrollLeft = Math.max(0, activeDot.offsetLeft - dots.offsetLeft - dots.clientWidth / 2 + activeDot.clientWidth / 2);
  }
  if (announce) heroAnnounce();
  heroListeners.forEach(listener => listener(hero.index));
}
function goHero(index, options = {}) {
  const total = hero.slides.length;
  if (!total) return;
  hero.index = ((index % total) + total) % total;
  paintHero(options.announce !== false);
}
function buildHero() {
  const featured = games.filter(g => g.spotlight || g.featured);
  hero.slides = spotlightPage
    // Spotlight page: narrow the featured slides to the artwork worker's quality-curated pool
    // first, then shuffle the survivors, then clone each slide so per-game media can override
    // the catalogue's heroArt and add a crop position without mutating the shared entries. A
    // malformed entry (non-object, or an src/position of the wrong type) is ignored outright,
    // leaving the slide as the catalogue served it. Finally the promotional slide is spliced into
    // the shuffled pool at a fresh random point, so it lands somewhere different every refresh.
    ? withBrandSlide(shuffleSlides(curatedHeroPool(featured)).map(game => {
        const media = mediaEntryFor(game.id);
        if (!media) return game;
        const clone = { ...game };
        if (isLocalArtPath(media.src)) clone.heroArt = media.src;
        if (typeof media.position === 'string') clone.heroPosition = media.position;
        return clone;
      }))
    : featured;
  hero.index = 0;
  const total = hero.slides.length;
  // The homepage keeps its numbered selectors; the spotlight page uses unnumbered
  // progress pills, so its digits are dropped and the title moves into a tooltip.
  $('#hero-dots').innerHTML = hero.slides.map((game, index) => {
    const label = spotlightPage ? '' : heroPad(index + 1);
    const title = spotlightPage ? ` title="${escape(game.title)}"` : '';
    return `<button class="hero-dot" type="button" data-hero-index="${index}" aria-label="Show spotlight ${index + 1} of ${total}: ${escape(game.title)}"${title}>${label}</button>`;
  }).join('');
  $('#hero-slider').hidden = total === 0;
  if (!total) { $('#hero-play').disabled = true; heroAnnounce(); return; }
  paintHero();
}
// Handed to spotlight.mjs on the spotlight page only. Nothing imports this script on the
// homepage, so index.html never loads the autoplay module.
const heroApi = {
  get index() { return hero.index; },
  get total() { return hero.slides.length; },
  // Exposed for the separate hero worker: the slide list itself, not just the current game.
  get slides() { return hero.slides; },
  get game() { return hero.slides[hero.index] || null; },
  go: (index, options) => goHero(index, options),
  next: options => goHero(hero.index + 1, options),
  prev: options => goHero(hero.index - 1, options),
  onChange: onHeroChange,
};
function details(id) {
  const game = games.find(g => g.id === id); if (!game) return;
  discovery?.close();
  const host = new URL(game.url).hostname;
  const mode = gameMode(game.id);
  const playable = mode.mode === 'iframe';
  const action = playable
    ? `<a class="button lime" href="#play/${escape(game.id)}" data-play="${escape(game.id)}">Play in gameflex</a>`
    : `<a class="button ghost" href="#play/${escape(game.id)}" data-play="${escape(game.id)}">Why it can’t play here</a>`;
  const note = playable
    ? `${host} · Page checked ${game.checkedAt}.<br>Play frames this page inside the gameflex player. Compatibility isn’t guaranteed.`
    : `${host} · Page checked ${game.checkedAt}.<br>${mode.reason}`;
  $('#dialog-content').innerHTML = `${art(game,'dialog-cover')}<div class="dialog-body"><span class="eyebrow lime-text">${escape(game.tag)}</span><h2 id="dialog-title">${escape(game.title)}</h2><div class="dialog-meta"><span>${escape(game.genre)}</span><span>${escape(game.platform || 'Desktop')}</span></div><p>${escape(game.description)}</p><div class="requirements"><strong>BEFORE YOU JUMP IN</strong><p>${escape(game.requirements || 'Runs in a desktop browser with keyboard and mouse.')}</p></div><div class="dialog-actions">${action}<button class="button ghost heart-inline" data-favourite="${escape(game.id)}" aria-pressed="false">${icons.heart} Favourite</button></div><p class="dialog-note">${escape(note)}</p></div>`;
  syncHearts(); $('#details').showModal();
}
function reset() { category = 'all'; search = ''; $('#search').value = ''; view = 'discover'; syncNav(); render(); }
function syncNav() {
  document.querySelectorAll('[data-view]').forEach(button => { const active = button.dataset.view === view; button.classList.toggle('active',active); active ? button.setAttribute('aria-current','page') : button.removeAttribute('aria-current'); });
  document.querySelectorAll('[data-category]').forEach(button => { const active = button.dataset.category === category; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); });
}
// Header chrome, shared by both pages: a pages menu right of search plus a placeholder
// account popover. Both are disclosures — Escape, an outside click or focus leaving the
// header closes them and returns focus to the trigger. There is no sign-in anywhere.
const headerMenus = [
  { name: 'pages', button: $('#menu-button'), panel: $('#site-menu') },
  { name: 'account', button: $('#account-button'), panel: $('#account-popover') },
].filter(entry => entry.button && entry.panel);
function closeMenus(except = null) {
  headerMenus.forEach(({ button, panel }) => {
    if (panel === except) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  });
}
function openMenu(entry) {
  closeMenus(entry.panel);
  entry.panel.hidden = false;
  entry.button.setAttribute('aria-expanded', 'true');
  entry.panel.querySelector('a, button')?.focus({ preventScroll: true });
}
const menuNamed = name => headerMenus.find(entry => entry.name === name);
headerMenus.forEach(entry => entry.button.addEventListener('click', () => {
  if (entry.panel.hidden) openMenu(entry); else closeMenus();
}));
$('#account-close')?.addEventListener('click', () => { closeMenus(); menuNamed('account')?.button.focus({ preventScroll: true }); });
document.addEventListener('click', event => { if (!event.target.closest('.header-tools')) closeMenus(); });
document.addEventListener('focusin', event => { if (!event.target.closest('.header-tools')) closeMenus(); });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const entry = headerMenus.find(item => !item.panel.hidden);
  if (!entry) return;
  event.preventDefault();
  closeMenus();
  entry.button.focus({ preventScroll: true });
});
document.addEventListener('click', event => {
  if (event.target.closest('#player')) return;
  const play = event.target.closest('[data-play]'); if (play) { event.preventDefault(); discovery?.close(); return openPlayer(play.dataset.play); }
  const favourite = event.target.closest('[data-favourite]'); if (favourite) return toggleFavourite(favourite.dataset.favourite);
  const info = event.target.closest('[data-details]'); if (info) { event.preventDefault(); return details(info.dataset.details); }
  const categoryButton = event.target.closest('[data-category]'); if (categoryButton) { category = categoryButton.dataset.category; syncNav(); return render(); }
  const viewButton = event.target.closest('[data-view]'); if (viewButton) { view = viewButton.dataset.view; category = 'all'; search = ''; $('#search').value = ''; syncNav(); return render(); }
  const arrow = event.target.closest('[data-scroll]'); if (arrow) stepShelf(document.getElementById(`row-${arrow.dataset.scroll}`), Number(arrow.dataset.direction));
  const dot = event.target.closest('[data-hero-index]'); if (dot) return goHero(Number(dot.dataset.heroIndex));
  if (event.target.closest('#hero-prev')) return goHero(hero.index - 1);
  if (event.target.closest('#hero-next')) return goHero(hero.index + 1);
  if (event.target.closest('.dialog-close')) event.target.closest('dialog').close();
  if (event.target.matches('dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); }
  if (event.target.closest('.wordmark')) reset();
});
$('#search').addEventListener('input', event => { search = event.target.value.trim(); render(); });
$('#reset').addEventListener('click', reset);
$('#surprise').addEventListener('click', () => { const filtered = filteredGames(); if (filtered.length) openPlayer(filtered[Math.floor(Math.random()*filtered.length)].id); });
$('#hero-play').addEventListener('click', () => {
  const game = hero.slides[hero.index];
  if (!game) return;
  // Brand slide: scroll to the real catalogue instead of opening anything. No game and no player
  // route is faked behind the promotional call to action.
  if (spotlightPage && game.brand) {
    document.getElementById('catalogue')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    return;
  }
  openPlayer(game.id);
});
$('#about-button').addEventListener('click', () => $('#about').showModal());
document.addEventListener('keydown', event => {
  if (isPlayerOpen()) return;
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) || document.querySelector('dialog[open]') || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === '/') { event.preventDefault(); $('#search').focus(); return; }
  if (event.target.closest('#hero-slider')) {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    goHero(event.key === 'Home' ? 0 : event.key === 'End' ? hero.slides.length - 1 : hero.index + (event.key === 'ArrowRight' ? 1 : -1));
    document.querySelector(`[data-hero-index="${hero.index}"]`)?.focus({preventScroll:true});
    return;
  }
  if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
  const shelf = event.target.closest('.shelf');
  if (!shelf) return;
  const row = shelf.querySelector('.game-row');
  const direction = event.key === 'ArrowRight' ? 1 : -1;
  event.preventDefault();
  const focusedCard = event.target.closest('.game-card');
  if (focusedCard) {
    const next = direction > 0 ? focusedCard.nextElementSibling : focusedCard.previousElementSibling;
    next?.querySelector('.game-art')?.focus({ preventScroll: true });
  }
  stepShelf(row, direction);
});
window.addEventListener('resize',updateArrows);
window.addEventListener('storage',event => { if (event.key !== 'gameflex:favourites') return; try { const values = JSON.parse(event.newValue || '[]'); favourites = new Set(Array.isArray(values) ? values.filter(id => typeof id === 'string') : []); render(); } catch { /* Ignore corrupted storage from other tabs. */ } });
let catalogueLoaded = false;
// Spotlight page only: the artwork workers' maps are fetched before the hero is built so the
// shuffled slides carry the overridden art and crop from the very first paint, and the Top games
// shelf can use the portrait posters. A missing file resolves to null and the catalogue art stands.
spotlightMedia = await loadSpotlightMedia();
spotlightPortraits = await loadSpotlightPortraits();
try {
  const response = await fetch('games.json'); if (!response.ok) throw new Error('catalogue unavailable'); games = await response.json();
  buildHero();
  document.querySelectorAll('[data-category]').forEach(button => { if(button.dataset.category !== 'all') button.hidden = !games.some(g => g.category === button.dataset.category); });
  catalogueLoaded = true;
} catch {
  $('#shelves').innerHTML = '<div class="empty-state"><h3>The arcade is taking a breather.</h3><p>We couldn’t load the collection. Refresh to try again.</p><button class="button lime" id="retry">Try again</button></div>';
  $('#retry').addEventListener('click',()=>location.reload()); $('#hero-play').disabled = true; $('#surprise').disabled = true;
}
await initPlayer({
  games: () => games,
  isFavourite: id => favourites.has(id),
  toggleFavourite: id => toggleFavourite(id),
  toast,
  closeDialogs: () => document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()),
});
// Spotlight page only: the browse layer swaps the homepage shelves for curated rows and a
// result grid, and owns the floating detail card. index.html never imports this module.
if (spotlightPage && catalogueLoaded) {
  try {
    const { initSpotlightDiscovery } = await import('./spotlight-discovery.mjs');
    discovery = initSpotlightDiscovery({
      games,
      mode: id => gameMode(id),
      isFavourite: id => favourites.has(id),
      // Real portrait posters for the ranked Top games shelf, when the artwork worker supplied
      // them; an empty string means the catalogue's own artwork is used instead.
      portraitSrc: id => portraitSrcFor(id),
      syncHearts,
    });
  } catch { /* The homepage shelves still work when the browse module cannot load. */ }
}
if (catalogueLoaded) render();
// Spotlight page only: the autoplay/pause controller for the new full-bleed hero. The
// module owns its own timers, so index.html never starts a slideshow.
if (spotlightPage && catalogueLoaded) {
  try {
    const { initSpotlightHero } = await import('./spotlight.mjs');
    initSpotlightHero({ hero: heroApi, isBusy: () => isPlayerOpen() || Boolean(document.querySelector('dialog[open]')) });
  } catch { /* The hero keeps its manual controls when the autoplay module cannot load. */ }
}

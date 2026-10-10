const $ = (selector, root = document) => root.querySelector(selector);
const icons = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
};
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let games = [], category = 'all', view = 'discover', search = '', toastTimer;
let favourites = new Set();
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
  const title = escape(game.title), id = escape(game.id), pending = game.availability === 'sandbox-pending';
  const href = pending ? '#details/' + id : escape(game.url);
  const attrs = pending ? 'data-details="' + id + '"' : 'target="_blank" rel="noopener noreferrer"';
  const label = pending ? 'Details for ' + title + ' — sandbox pending' : 'Play ' + title + ' (opens in a new tab)';
  return `<article class="game-card"><a class="game-art" href="${href}" ${attrs} aria-label="${label}">${art(game)}<span class="card-tag">${escape(game.tag)}</span><span class="play-hover"><span>${pending ? 'View game details' : 'Play now ↗'}</span></span></a><button class="heart" data-favourite="${id}" aria-pressed="false" aria-label="Save ${title} to favourites">${icons.heart}</button><div class="card-title-row"><a href="${href}" ${attrs}>${title}${pending ? '' : '<span class="sr-only"> (opens in a new tab)</span>'}</a><button class="info-button" data-details="${id}" aria-label="Details for ${title}">ⓘ</button></div><p class="card-meta"><span>${escape(game.genre)}</span><span class="dot"></span><span>${escape(game.platform || 'Desktop')}</span>${game.ownFiles ? '<span class="dot"></span><span class="file-tag">Own files</span>' : ''}</p>${pending ? '<p class="pending-label">Sandbox pending</p>' : ''}</article>`;
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
// Hero carousel. Slides are the games the catalogue marks as spotlight or featured, in
// catalogue order. Artwork prefers an optional heroArt (wide crop) and falls back to art.
const hero = { slides: [], index: 0 };
const heroPad = value => String(value).padStart(2, '0');
const heroArtOf = game => game.heroArt || game.art || '';
function heroAnnounce() {
  const game = hero.slides[hero.index];
  $('#hero-status').textContent = game ? `Spotlight ${hero.index + 1} of ${hero.slides.length}: ${game.title}` : '';
}
function paintHero() {
  const game = hero.slides[hero.index];
  if (!game) return;
  const art = heroArtOf(game), image = $('#hero-image');
  image.style.backgroundImage = art ? `url("${art.replace(/["\\]/g, '\\$&')}")` : 'none';
  image.classList.toggle('hero-image-empty', !art);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    image.classList.remove('hero-fade');
    void image.offsetWidth;
    image.classList.add('hero-fade');
  }
  $('#spotlight-name').textContent = game.title;
  $('#spotlight-genre').textContent = [game.genre, game.availability === 'sandbox-pending' ? 'Sandbox pending' : (game.platform || 'Desktop')].filter(Boolean).join(' · ');
  $('#spotlight-description').textContent = game.description || '';
  $('#spotlight-requirements').textContent = game.requirements || '';
  document.querySelectorAll('[data-hero-index]').forEach((dot, index) => {
    const active = index === hero.index;
    dot.classList.toggle('active', active);
    if (active) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current');
    dot.tabIndex = active ? 0 : -1;
  });
  $('#hero-index-current').textContent = heroPad(hero.index + 1);
  $('#hero-index-total').textContent = heroPad(hero.slides.length);
  const single = hero.slides.length < 2;
  $('#hero-prev').disabled = single; $('#hero-next').disabled = single;
  $('#hero-play').disabled = false;
  $('#hero-play').setAttribute('aria-label', `Open details for ${game.title}`);
  const activeDot = document.querySelector(`[data-hero-index="${hero.index}"]`);
  if (activeDot) {
    const dots = activeDot.parentElement;
    dots.scrollLeft = Math.max(0, activeDot.offsetLeft - dots.offsetLeft - dots.clientWidth / 2 + activeDot.clientWidth / 2);
  }
  heroAnnounce();
}
function goHero(index) {
  const total = hero.slides.length;
  if (!total) return;
  hero.index = ((index % total) + total) % total;
  paintHero();
}
function buildHero() {
  hero.slides = games.filter(g => g.spotlight || g.featured);
  hero.index = 0;
  const total = hero.slides.length;
  $('#hero-dots').innerHTML = hero.slides.map((game, index) => `<button class="hero-dot" type="button" data-hero-index="${index}" aria-label="Show spotlight ${index + 1} of ${total}: ${escape(game.title)}">${heroPad(index + 1)}</button>`).join('');
  $('#hero-slider').hidden = total === 0;
  if (!total) { $('#hero-play').disabled = true; heroAnnounce(); return; }
  paintHero();
}
function details(id) {
  const game = games.find(g => g.id === id); if (!game) return;
  const host = new URL(game.url).hostname;
  const pending = game.availability === 'sandbox-pending';
  const launch = pending ? '<button class="button ghost" disabled>Sandbox pending</button>' : `<a class="button lime" href="${escape(game.url)}" target="_blank" rel="noopener noreferrer">Play now <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a>`;
  $('#dialog-content').innerHTML = `${art(game,'dialog-cover')}<div class="dialog-body"><span class="eyebrow lime-text">${escape(game.tag)}</span><h2 id="dialog-title">${escape(game.title)}</h2><div class="dialog-meta"><span>${escape(game.genre)}</span><span>${escape(game.platform || 'Desktop')}</span></div><p>${escape(game.description)}</p><div class="requirements"><strong>BEFORE YOU JUMP IN</strong><p>${escape(game.requirements || 'Opens on an independent website. Use a desktop keyboard and mouse for the best experience.')}</p></div><div class="dialog-actions">${launch}<button class="button ghost heart-inline" data-favourite="${escape(game.id)}" aria-pressed="false">${icons.heart} Favourite</button></div><p class="dialog-note">${escape(host)} · Launch page checked ${escape(game.checkedAt)}.<br>Gameplay and device compatibility may vary.</p></div>`;
  syncHearts(); $('#details').showModal();
}
function reset() { category = 'all'; search = ''; $('#search').value = ''; view = 'discover'; syncNav(); render(); }
function syncNav() {
  document.querySelectorAll('[data-view]').forEach(button => { const active = button.dataset.view === view; button.classList.toggle('active',active); active ? button.setAttribute('aria-current','page') : button.removeAttribute('aria-current'); });
  document.querySelectorAll('[data-category]').forEach(button => { const active = button.dataset.category === category; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); });
}
document.addEventListener('click', event => {
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
$('#surprise').addEventListener('click', () => { const filtered = filteredGames(); if (filtered.length) details(filtered[Math.floor(Math.random()*filtered.length)].id); });
$('#hero-play').addEventListener('click', () => details(hero.slides[hero.index]?.id || games.find(g=>g.spotlight)?.id || games[0]?.id));
$('#hero-slider').addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  goHero(hero.index + (event.key === 'ArrowRight' ? 1 : -1));
  if (event.target.matches('[data-hero-index]')) document.querySelector(`[data-hero-index="${hero.index}"]`)?.focus({preventScroll:true});
});
$('#about-button').addEventListener('click', () => $('#about').showModal());
document.addEventListener('keydown', event => {
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) || document.querySelector('dialog[open]') || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === '/') { event.preventDefault(); $('#search').focus(); return; }
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
try {
  const response = await fetch('games.json'); if (!response.ok) throw new Error('catalogue unavailable'); games = await response.json();
  buildHero();
  document.querySelectorAll('[data-category]').forEach(button => { if(button.dataset.category !== 'all') button.hidden = !games.some(g => g.category === button.dataset.category); });
  render();
} catch {
  $('#shelves').innerHTML = '<div class="empty-state"><h3>The arcade is taking a breather.</h3><p>We couldn’t load the collection. Refresh to try again.</p><button class="button lime" id="retry">Try again</button></div>';
  $('#retry').addEventListener('click',()=>location.reload()); $('#hero-play').disabled = true; $('#surprise').disabled = true;
}

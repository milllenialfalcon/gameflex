/**
 * spotlight-discovery — the browse layer for the Spotlight page (spotlight.html only).
 *
 * app.js imports this module only when <html> carries page-spotlight, and only then does it
 * delegate the #shelves markup to render() here. The homepage keeps its own shelves and its
 * existing behaviour untouched.
 *
 * Two shapes:
 *   - Browse  → short curated shelves grouped by genre or intent, at most MAX_ROW games per
 *               row, no provider mega-row and no 30+ item scroller. Every catalogue game is
 *               placed at least once (leftovers are chunked into "More classics").
 *   - Filtered / search / favourites → one responsive grid of every matching game.
 *
 * Resting cards are artwork only: no captions, titles, meta, tag chips or heart buttons under
 * the image. A game that cannot launch here carries one small, unobtrusive overlay.
 *
 * A floating detail card opens above the page (portal on <body>, position: fixed, so it never
 * reflows content or gets clipped by a row's overflow) after a short hover, on keyboard focus
 * or on an explicit tap of the card's details affordance. The card holds a larger landscape
 * image, the title, genre, a brief description, an honest availability note, and Play/View,
 * Favourite and Info controls that reuse the existing data-play / data-favourite / data-details
 * handlers in app.js. Escape or an outside click closes it. On touch the first tap opens the
 * card; only the card's own Play control opens the existing player.
 */
const MAX_ROW = 8;
const HOVER_DELAY = 200;
const CLOSE_DELAY = 140;
const BRIEF_LENGTH = 150;
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);

/** Shelf plan: ordered predicates, each game claimed by the first row that matches. */
function shelfPlan(games, isPlayable) {
  const defs = [
    { id: 'ready-shooters', title: 'Start here', match: g => isPlayable(g) && g.category === 'shooters' },
    { id: 'ready-more', title: 'Change the pace', match: g => isPlayable(g) && g.category !== 'shooters' },
    { id: 'shooter-legends', title: 'Shooter legends', match: g => g.provider === 'dos-zone' && g.category === 'shooters' },
    { id: 'empires', title: 'Build an empire', match: g => g.category === 'strategy' && !/artillery|chess|management/i.test(g.genre || '') },
    { id: 'think', title: 'Think it through', match: g => ['puzzle', 'strategy'].includes(g.category) || g.id === 'wasmarcade' },
    { id: 'platformers', title: 'Jump and run', match: g => g.category === 'platformers' },
    { id: 'adventures', title: 'Stories and adventures', match: g => ['adventure', 'rpg'].includes(g.category) },
    { id: 'cities', title: 'Build a city', match: g => g.category === 'simulation' },
    { id: 'fight-race', title: 'Fight and race', match: g => ['fighting', 'racing'].includes(g.category) },
  ];
  const claimed = new Set();
  const rows = [];
  for (const def of defs) {
    const items = games.filter(g => !claimed.has(g.id) && def.match(g)).slice(0, MAX_ROW);
    if (!items.length) continue;
    items.forEach(g => claimed.add(g.id));
    rows.push({ id: def.id, title: def.title, games: items });
  }
  const rest = games.filter(g => !claimed.has(g.id));
  for (let i = 0; i < rest.length; i += MAX_ROW) {
    rows.push({ id: `more-${i / MAX_ROW + 1}`, title: 'More classics', games: rest.slice(i, i + MAX_ROW) });
  }
  return rows;
}

const brief = value => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= BRIEF_LENGTH) return text;
  const cut = text.slice(0, BRIEF_LENGTH);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 60))}…`;
};

function artMarkup(game, className) {
  const src = className === 'sd-img' ? game.art || game.heroArt : game.heroArt || game.art;
  if (src) return `<img class="${className}" src="${escape(src)}" alt="" loading="lazy" decoding="async">`;
  return `<span class="${className} sd-fallback" style="--cover:${escape(game.color || '#37452b')}">${escape(game.symbol || '+')}</span>`;
}

export function initSpotlightDiscovery({ games = [], mode, isFavourite = () => false, syncHearts = () => {} } = {}) {
  const byId = new Map(games.map(game => [game.id, game]));
  const isPlayable = game => (mode?.(game.id)?.mode) === 'iframe';

  let panel = null, activeCard = null, openTimer = 0, closeTimer = 0, frame = 0, suppressFocus = false, touchFocus = false;

  const cardMarkup = game => {
    const id = escape(game.id), title = escape(game.title);
    const status = isPlayable(game) ? '' : `<span class="sd-badge">${game.availability === 'sandbox-pending' ? 'Pending' : 'Unavailable'}</span>`;
    return `<article class="game-card sd-card" data-game="${id}">`
      + `<button class="game-art sd-art" type="button" data-sd-open="${id}" aria-haspopup="dialog" aria-expanded="false" aria-label="Show details for ${title}, ${escape(game.genre)}">`
      + artMarkup(game, 'sd-img') + status
      + '</button></article>';
  };

  function shelfMarkup(row) {
    const heading = `sd-h-${row.id}`, label = escape(row.title);
    return `<section class="shelf sd-shelf" aria-labelledby="${heading}">`
      + `<div class="shelf-heading"><h3 id="${heading}">${label}</h3>`
      + `<div class="shelf-controls"><button class="shelf-arrow" type="button" data-scroll="${row.id}" data-direction="-1" aria-label="Scroll ${label} left by one game">‹</button>`
      + `<button class="shelf-arrow" type="button" data-scroll="${row.id}" data-direction="1" aria-label="Scroll ${label} right by one game">›</button></div></div>`
      + `<div class="game-row sd-row" id="row-${row.id}" tabindex="0" role="region" aria-labelledby="${heading}">${row.games.map(cardMarkup).join('')}</div>`
      + '</section>';
  }

  function gridMarkup(list, label) {
    return `<section class="sd-results" aria-label="${escape(label)}"><div class="sd-grid">${list.map(cardMarkup).join('')}</div></section>`;
  }

  function availabilityText(game) {
    const entry = mode?.(game.id) || {};
    if (entry.mode === 'iframe') return 'Plays inside the GAMEFLEX player. Compatibility isn’t guaranteed.';
    if (game.availability === 'sandbox-pending') return 'Sandbox integration is pending, so it can’t launch here yet.';
    return entry.reason || 'Not playable inside GAMEFLEX yet.';
  }

  function panelMarkup(game) {
    const id = escape(game.id), title = escape(game.title);
    const playable = isPlayable(game);
    const saved = isFavourite(game.id);
    const primary = playable
      ? `<a class="button lime sd-action" href="#play/${id}" data-play="${id}">Play in gameflex</a>`
      : `<button class="button lime sd-action" type="button" data-play="${id}">View status</button>`;
    const meta = [game.genre, game.platform || 'Desktop'].filter(Boolean).map(escape).join(' · ');
    return `<div class="sd-panel" role="dialog" aria-modal="false" aria-label="${title}" tabindex="-1">`
      + `<div class="sd-panel-art">${artMarkup(game, 'sd-panel-img')}</div>`
      + `<div class="sd-panel-body">`
      + `<h3 class="sd-panel-title">${title}</h3>`
      + `<p class="sd-panel-genre">${meta}</p>`
      + `<p class="sd-panel-copy">${escape(brief(game.description))}</p>`
      + `<p class="sd-panel-avail${playable ? '' : ' is-pending'}">${escape(availabilityText(game))}</p>`
      + `<div class="sd-panel-actions">`
      + primary
      + `<button class="button ghost heart-inline sd-action" type="button" data-favourite="${id}" aria-pressed="${saved ? 'true' : 'false'}">${HEART}<span>Favourite</span></button>`
      + `<button class="button ghost sd-action" type="button" data-details="${id}">Info</button>`
      + '</div></div></div>';
  }

  function position(card) {
    if (!panel || !card) return;
    const rect = card.getBoundingClientRect();
    const width = panel.offsetWidth, height = panel.offsetHeight;
    const maxLeft = Math.max(12, window.innerWidth - width - 12);
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, maxLeft));
    if (rect.right < 0 || rect.left > window.innerWidth || rect.bottom < 0 || rect.top > window.innerHeight) { closePanel(); return; }
    const top = Math.max(12, Math.min(rect.top - 8, window.innerHeight - height - 12));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }

  const focusables = () => panel ? [...panel.querySelectorAll('a[href], button:not([disabled])')] : [];

  function closePanel({ restoreFocus = false } = {}) {
    clearTimeout(openTimer); clearTimeout(closeTimer);
    if (!panel) { activeCard = null; return; }
    const card = activeCard;
    const hadFocus = panel.contains(document.activeElement);
    panel.remove(); panel = null; activeCard = null;
    if (card) {
      const trigger = card.querySelector('.sd-art');
      trigger?.setAttribute('aria-expanded', 'false');
      if (restoreFocus || hadFocus) {
        suppressFocus = true;
        trigger?.focus({ preventScroll: true });
        suppressFocus = false;
      }
    }
  }

  function openPanel(card, { focusPanel = false } = {}) {
    if (!card || !card.dataset.game) return;
    const game = byId.get(card.dataset.game);
    if (!game) return;
    if (activeCard === card && panel) { position(card); return; }
    closePanel();
    activeCard = card;
    card.querySelector('.sd-art')?.setAttribute('aria-expanded', 'true');
    const host = document.createElement('div');
    host.innerHTML = panelMarkup(game);
    panel = host.firstElementChild;
    document.body.appendChild(panel);
    position(card);
    syncHearts();
    if (focusPanel) focusables()[0]?.focus({ preventScroll: true });
  }

  const armOpen = card => {
    if (activeCard === card && panel) { clearTimeout(closeTimer); return; }
    clearTimeout(openTimer); clearTimeout(closeTimer);
    openTimer = setTimeout(() => openPanel(card), HOVER_DELAY);
  };
  const armClose = () => {
    clearTimeout(openTimer);
    if (!panel) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => closePanel(), CLOSE_DELAY);
  };
  const onPointerOver = event => {
    if (event.pointerType === 'touch') return;
    const card = event.target.closest?.('.sd-card');
    if (card) { armOpen(card); return; }
    if (event.target.closest?.('.sd-panel')) { clearTimeout(closeTimer); clearTimeout(openTimer); return; }
    if (panel) armClose();
  };
  const onPointerOut = event => {
    if (event.pointerType === 'touch') return;
    const to = event.relatedTarget;
    if (to instanceof Element && (to.closest('.sd-panel') || to.closest('.sd-card'))) { clearTimeout(closeTimer); return; }
    if (!event.target.closest?.('.sd-card') && !event.target.closest?.('.sd-panel')) return;
    armClose();
  };

  const onClick = event => {
    if (event.target.closest('#player') || event.target.closest('dialog')) return;
    const card = event.target.closest('.sd-card');
    if (card) { openPanel(card); return; }
    if (panel && !event.target.closest('.sd-panel')) closePanel();
  };
  const onFocusIn = event => {
    if (suppressFocus || touchFocus) return;
    const card = event.target.closest?.('.sd-card');
    if (!card) { if (panel && !panel.contains(event.target)) closePanel(); return; }
    clearTimeout(openTimer); clearTimeout(closeTimer);
    openPanel(card);
  };
  const onKeyDown = event => {
    if (event.key === 'Escape' && panel) { event.preventDefault(); closePanel({ restoreFocus: true }); return; }
    if (event.key !== 'Tab' || !panel) return;
    const items = focusables();
    if (!items.length) return;
    const active = document.activeElement;
    if (activeCard?.contains(active)) {
      if (!event.shiftKey) { event.preventDefault(); items[0].focus({ preventScroll: true }); }
      return;
    }
    if (panel.contains(active)) {
      const index = items.indexOf(active);
      if (!event.shiftKey && index === items.length - 1) {
        event.preventDefault();
        const cards = [...document.querySelectorAll('.sd-art')];
        const next = cards[cards.indexOf(activeCard?.querySelector('.sd-art')) + 1] || document.querySelector('footer button, footer a');
        closePanel();
        next?.focus({ preventScroll: true });
      } else if (event.shiftKey && index === 0) { event.preventDefault(); activeCard?.querySelector('.sd-art')?.focus({ preventScroll: true }); }
    }
  };
  const reposition = () => {
    if (!panel || !activeCard) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => position(activeCard));
  };
  const onOutside = event => {
    // Wait for the touch click before expanding: opening during focusin moves the
    // artwork beneath the finger and can retarget the click to the page background.
    touchFocus = event.pointerType === 'touch';
    if (touchFocus) setTimeout(() => { touchFocus = false; }, 600);
    if (panel && !event.target.closest?.('.sd-panel') && !event.target.closest?.('.sd-card')) closePanel();
  };

  document.addEventListener('pointerover', onPointerOver, { passive: true });
  document.addEventListener('pointerout', onPointerOut, { passive: true });
  document.addEventListener('click', onClick);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerdown', onOutside, { passive: true });
  window.addEventListener('scroll', reposition, { passive: true, capture: true });
  window.addEventListener('resize', reposition);
  if ('MutationObserver' in window) {
    new MutationObserver(() => { if (document.documentElement.classList.contains('player-open')) closePanel(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  return {
    /** Renders the catalogue region. isBrowse → curated shelves, otherwise one grid. */
    render({ isBrowse, filtered, view, category }) {
      closePanel();
      if (!filtered?.length) return '';
      if (isBrowse) return shelfPlan(games, isPlayable).map(shelfMarkup).join('');
      const label = view === 'favourites' ? 'Saved games' : category && category !== 'all' ? 'Filtered games' : 'Search results';
      return gridMarkup(filtered, label);
    },
    close: () => closePanel(),
  };
}

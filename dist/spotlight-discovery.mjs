/**
 * spotlight-discovery — the browse layer for the Spotlight page (spotlight.html only).
 *
 * app.js imports this module only when <html> carries page-spotlight, and only then does it
 * delegate the #shelves markup to render() here. The homepage keeps its own shelves and its
 * existing behaviour untouched.
 *
 * Shelf shapes, in order:
 *   - Continue playing → up to 20 locally remembered launches, newest first, shown only once this
 *     browser has one. Recorded when an in-site launch really creates its frame (below), never from
 *     opening the ready player or from browsing. On a fresh browser, before there is any real
 *     history, the same slot shows a fixed, unlabelled preview of five launchable catalogue games
 *     (kind `demo`). The preview is computed on the fly and never stored — nothing is written to
 *     `gameflex:recent` for it — and it is dropped the moment this browser has any real history, so
 *     genuine launches always supersede it. This shelf's row is sized so five wider cards fill the
 *     desktop viewport (see spotlight-discovery.css), which sets it apart from the six-card rows.
 *   - Top games → ten unique editorial picks with a code-native SVG rank numeral beside the artwork
 *     and, when the artwork worker supplied one, a real portrait (2:3) poster. Curated, not a
 *     play-count or popularity claim.
 *   - Curated shelves → short rows (at most MAX_ROW games) grouped by genre or intent. Every
 *     catalogue game appears at least once here; leftovers are chunked into "More classics".
 *   - Filtered / search / favourites → one responsive grid of every matching game.
 *
 * Resting cards are landscape artwork with the title in a plain line under the image (never
 * overlaying it). Each Continue playing card's name line opens with the small lime play triangle;
 * no shelf heading and no other card carries that mark. The ranked Top games row swaps in a
 * portrait poster on the right of each card with the numerals 1..10 tucked behind the poster's left
 * edge — that row carries no visible name
 * line, because the rank and the poster are the whole card and the button's accessible label still
 * names the game. A game that cannot launch here carries one small status chip in the artwork's
 * top-left corner. Each shelf heading opens with an original stroke-only lime glyph (aria-hidden)
 * that sits in its own gutter beside the heading block, vertically centred across the title and
 * subtitle lines, and the shelf subtitle sits in the heading's text column.
 *
 * Continue playing (the fresh-browser preview or a real local history) is the one shelf whose cards
 * link straight into the player: each card is a plain #play/<id> anchor with the shared data-play
 * handler, so Enter or a tap opens the ready player and the existing Start gate stays in charge.
 * Those cards never open the floating detail card (no panel on hover, focus or tap) and the row
 * closes any panel that is already open. Two things under the artwork are honest about themselves:
 * the demo preview paints fixed sample fractions ([35,62,18,48,76]) on a 3px rail labelled "Sample
 * progress" and stores nothing, while a real history entry paints an empty rail labelled "Gameplay
 * progress unavailable" — a cross-origin frame cannot report gameplay progress.
 *
 * Launch history (local only; no backend and no cross-origin save state):
 *   - Stored under `gameflex:recent`, at most 20 ids, newest first, deduplicated.
 *   - Written only when #player-stage actually holds a player frame AND the current #play/<id>
 *     hash names a catalogue game whose configured mode is iframe. Starting that frame is an
 *     honest record of an attempted launch; it is not evidence of gameplay, compatibility or
 *     saved progress.
 *   - Malformed storage, unknown ids and unavailable storage degrade to a missing shelf.
 *   - After the player closes, the shelves repaint from the last render() args so the shelf is
 *     current: focus returns to the same game in the same shelf row it was in (the new Continue
 *     playing shelf holds a duplicate, which is not preferred), every row keeps its horizontal
 *     scroll, and the focus restore is suppressed so it never opens the detail card. The shared
 *     player is untouched.
 *
 * A floating detail card opens above the page (portal on <body>, position: fixed, so it never
 * reflows content or gets clipped by a row's overflow) after a short hover, on keyboard focus
 * or on an explicit tap of the card's details affordance. The card holds a larger landscape
 * image, the title, genre, a brief description, an honest availability note, and Play Now/View
 * status, Favourite and Info controls that reuse the existing data-play / data-favourite /
 * data-details handlers in app.js. It is centred on the source card's thumbnail rectangle — not on
 * the whole card — and clamped to the viewport and to 12px below the site header's bottom edge.
 * Escape or an outside click closes it. Cards on the Continue playing shelf never open it: their
 * first tap or Enter goes straight to the player's ready screen.
 */
const MAX_ROW = 8;
const TOP_LIMIT = 10;
const RECENT_LIMIT = 20;
const RECENT_KEY = 'gameflex:recent';
// Fixed sample fractions for the preview shelf's progress rail: index-aligned with the preview
// cards, deterministic, and never written anywhere. A real history entry never shows a fraction.
const DEMO_PROGRESS = [35, 62, 18, 48, 76];
const HOVER_DELAY = 200;
const CLOSE_DELAY = 140;
const BRIEF_LENGTH = 150;
const ID_PATTERN = /^[a-z0-9-]{1,40}$/i;
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
// The small lime play triangle that opens the name line of each Continue playing card — and only
// those cards. No other shelf and no other card carries it.
const PLAY_MARK = '<span class="sd-play-mark" aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m8 5 11 7-11 7z"/></svg></span>';
// Rank numerals 1..10 are SVG text, so their baseline is geometry rather than a font metric the
// layout engine has to guess. The viewBox is the digits' real ink box in the shipped body font
// (Space Grotesk, assets/body.ttf: 1000 units/em, cap height 700, round digits overshooting to 714
// above the baseline and -14 below, wide ink ending at x=592, the narrowest digit advancing from
// x=318), padded by 6 units so the 2px outline is never clipped by the glyph's own box. The text is
// drawn at font-size 1000 with its baseline at y=700, so one viewBox unit is exactly one font unit
// and the digit's real ink spans -14..714 inside the -20..720 box. The
// numeral's box is stretched to the poster's height by the card grid, so mapping the ink box onto
// it with preserveAspectRatio="none" lands the baseline a hair above the poster's bottom edge and
// leaves nothing able to paint below the poster — no negative margin, no line-height guesswork.
// Every digit is right-anchored in the box, so the narrow 1 sits as close to the poster as a wide
// 0, and the pair in 10 is squeezed into one digit's width with textLength instead of a transform.
const RANK_VIEWBOX = '14 -20 584 740';
const RANK_TEXT_X = 598;
const RANK_TEN_LENGTH = 576;
// The shelf heading marks: thirteen original cyberpunk outline glyphs (broken hexes, brackets,
// circuit crosshairs, triangular tech marks). Every one is stroke-only on a 24-viewBox — fill
// none, stroke currentColor at 1.7px — and decorative, so it is aria-hidden and adds no text to
// the heading. Each carries a data-sd-glyph name so QA can see the shuffle without reading paths.
const glyph = (name, d) => `<svg viewBox="0 0 24 24" data-sd-glyph="${name}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const GLYPHS = [
  glyph('hex-break', '<path d="M13.4 3.2 19.6 6.8V12"/><path d="M19.6 15.9v1l-7.6 4.4-7.6-4.4V6.8l7.6-4.4 4.2 2.4"/><circle cx="12" cy="12" r="1.2"/>'),
  glyph('bracket-pair', '<path d="M9.5 4.5h-4v15h4"/><path d="M14.5 4.5h4v15h-4"/><path d="M10 12h4"/>'),
  glyph('circuit-crosshair', '<path d="M12 2.8v4.4M12 16.8v4.4M2.8 12h4.4M16.8 12h4.4"/><circle cx="12" cy="12" r="4.6"/><rect x="10" y="10" width="4" height="4" rx=".6"/>'),
  glyph('triangle-tech', '<path d="M12 3.4 20.6 18.4H3.4Z"/><path d="M12 9.2 15.9 16H8.1Z"/><circle cx="12" cy="12.6" r="1"/>'),
  glyph('chevron-stack', '<path d="M6 6.5 12 2.5l6 4"/><path d="M6 12 12 8l6 4"/><path d="M6 17.5 12 13.5l6 4"/>'),
  glyph('cube-wireframe', '<path d="M12 2.6 20.4 7.3v9.4L12 21.4 3.6 16.7V7.3Z"/><path d="M3.6 7.3 12 12l8.4-4.7"/><path d="M12 12v9.4"/>'),
  glyph('diamond-grid', '<path d="M12 2.6 21.4 12 12 21.4 2.6 12Z"/><path d="M12 7l5 5-5 5-5-5Z"/><circle cx="12" cy="12" r=".9"/>'),
  glyph('octagon-slash', '<path d="M9.1 3.4h5.8l5.7 5.7v5.8l-5.7 5.7H9.1l-5.7-5.7V9.1Z"/><path d="M8.6 15.4 15.4 8.6"/>'),
  glyph('circuit-trace', '<path d="M4.5 6.5h5l3 3v8"/><path d="M19.5 6.5h-4.2"/><path d="M19.5 17.5h-6.8"/><circle cx="4.5" cy="6.5" r="1.3"/><circle cx="19.5" cy="6.5" r="1.3"/><circle cx="19.5" cy="17.5" r="1.3"/>'),
  glyph('reticle-squares', '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="2"/><rect x="8.6" y="8.6" width="6.8" height="6.8" rx="1"/><path d="M12 .8v2.8M12 20.4v2.8M.8 12h2.8M20.4 12h2.8"/>'),
  glyph('arrow-frame', '<path d="M4 6h16v12H4Z"/><path d="M8 12h9"/><path d="m14.5 9.5 2.5 2.5-2.5 2.5"/>'),
  glyph('hex-slash', '<path d="M12 2.6 20.4 7.4v9.2L12 21.4 3.6 16.6V7.4Z"/><path d="M7.2 8.4 16.8 15.6"/>'),
  glyph('node-plus', '<path d="M12 4v16M4 12h16"/><circle cx="12" cy="12" r="3.4"/>'),
];
// Fisher–Yates, run once per init so a page load always hands the marks out in a fresh order while
// a single visit keeps them fixed.
const shuffle = list => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};
// The fresh-browser preview shelf: a few launchable catalogue games, in a fixed editorial order.
// Nothing here is persisted and no play count, percentage or "last played" time is invented.
const DEMO_ORDER = ['halo', 'bo1', 'quake3', 'diablo', 'vicecity', 'skate'];
const DEMO_LIMIT = 5;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);

/** CSS.escape where the browser has it; catalogue and row ids are already [A-Za-z0-9-], so the
 *  raw value is a safe selector fallback and never allows an injected selector. */
const CSS_ESCAPE = value => (window.CSS?.escape ? CSS.escape(String(value)) : String(value));

/** Curated shelf plan: ordered predicates, each game claimed by the first row that matches.
 *  Subtitles describe the shelf's contents only — a configured iframe mode proves nothing about
 *  gameplay, so no shelf claims a game is verified, tested or working. */
const SHELF_DEFS = [
  { id: 'ready-shooters', title: 'Start here', subtitle: 'Shooters to start with.', match: g => g.category === 'shooters', playable: true },
  { id: 'ready-more', title: 'Change the pace', subtitle: 'Zombies, sport and a few surprises.', match: () => true, playable: true },
  { id: 'shooter-legends', title: 'Shooter legends', subtitle: 'Doom, Duke and the classics.', match: g => g.provider === 'dos-zone' && g.category === 'shooters' },
  { id: 'empires', title: 'Build an empire', subtitle: 'Plan, build and conquer.', match: g => g.category === 'strategy' && !/artillery|chess|management/i.test(g.genre || '') },
  { id: 'think', title: 'Think it through', subtitle: 'Puzzles, tactics and board games.', match: g => ['puzzle', 'strategy'].includes(g.category) || g.id === 'wasmarcade' },
  { id: 'platformers', title: 'Jump and run', subtitle: 'Timed jumps. Secret routes.', match: g => g.category === 'platformers' },
  { id: 'adventures', title: 'Stories and adventures', subtitle: 'Explore worlds and follow the story.', match: g => ['adventure', 'rpg'].includes(g.category) },
  { id: 'cities', title: 'Build a city', subtitle: 'Build it. Keep it running.', match: g => g.category === 'simulation' },
  { id: 'fight-race', title: 'Fight and race', subtitle: 'Fast laps and close fights.', match: g => ['fighting', 'racing'].includes(g.category) },
];
const MORE_SUBTITLE = 'More picks from the collection.';
/** Top games — explicit editorial order. Entries missing from the catalogue, or not launchable in
 *  this player, are skipped; the fallback fill below tops the row back up to ten unique games. */
const TOP_ORDER = ['halo', 'bo1', 'quake3', 'diablo', 'webxash', 'vicecity', 'skate', 'simpsons', 'pes6', 'quake'];

function curatedRows(games, isPlayable) {
  const claimed = new Set();
  const rows = [];
  for (const def of SHELF_DEFS) {
    const pool = def.playable ? games.filter(game => isPlayable(game)) : games;
    const items = pool.filter(game => !claimed.has(game.id) && def.match(game)).slice(0, MAX_ROW);
    if (!items.length) continue;
    items.forEach(game => claimed.add(game.id));
    rows.push({ kind: 'curated', id: def.id, title: def.title, subtitle: def.subtitle, games: items });
  }
  const rest = games.filter(game => !claimed.has(game.id));
  for (let i = 0; i < rest.length; i += MAX_ROW) {
    rows.push({ kind: 'curated', id: `more-${i / MAX_ROW + 1}`, title: 'More classics', subtitle: MORE_SUBTITLE, games: rest.slice(i, i + MAX_ROW) });
  }
  return rows;
}

/** Ten unique editorial picks, spanning genres. The explicit TOP_ORDER goes first but only where
 *  the game is launchable here; the launchable-first, then whole-catalogue fill reaches ten unique
 *  entries when an ordered pick is gone or no longer launchable. Curated, not a popularity claim. */
function topGames(games, isPlayable) {
  const byId = new Map(games.map(game => [game.id, game]));
  const seen = new Set(), picked = [];
  const take = game => {
    if (!game || picked.length >= TOP_LIMIT || seen.has(game.id)) return;
    seen.add(game.id);
    picked.push(game);
  };
  for (const id of TOP_ORDER) {
    const game = byId.get(id);
    if (game && isPlayable(game)) take(game);
  }
  const fill = pool => { for (const game of pool) { if (picked.length >= TOP_LIMIT) return; take(game); } };
  fill(games.filter(game => isPlayable(game)));
  fill(games);
  return picked;
}

/** Only ids that still exist in the catalogue are kept, so a stale or junk entry is inert. */
function validIds(values, byId) {
  if (!Array.isArray(values)) return [];
  const seen = new Set(), out = [];
  for (const value of values) {
    if (typeof value !== 'string' || !ID_PATTERN.test(value) || seen.has(value) || !byId.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= RECENT_LIMIT) break;
  }
  return out;
}

const brief = value => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= BRIEF_LENGTH) return text;
  const cut = text.slice(0, BRIEF_LENGTH);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 60))}…`;
};

export function initSpotlightDiscovery({ games = [], mode, isFavourite = () => false, portraitSrc = () => '', syncHearts = () => {} } = {}) {
  const list = Array.isArray(games) ? games.filter(game => game && typeof game.id === 'string' && ID_PATTERN.test(game.id)) : [];
  const byId = new Map(list.map(game => [game.id, game]));
  // Availability always comes from the player's own config through app.js, never guessed here.
  const isPlayable = game => Boolean(game) && mode?.(game.id)?.mode === 'iframe';
  // Real portrait poster for a ranked Top game, or '' when the artwork worker did not supply one.
  // Same local-asset rule app.js applies: only a plain assets/ path is accepted.
  const portraitOf = game => {
    let src = '';
    try { src = portraitSrc(game.id) || ''; } catch { src = ''; }
    return typeof src === 'string' && src.startsWith('assets/') && !src.includes('..') && !src.includes('\\') && !src.includes('://') ? src : '';
  };

  const readRecent = () => {
    try { return validIds(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'), byId); }
    catch { return []; } // Malformed or unavailable storage: browse without history.
  };
  const writeRecent = ids => {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids)); return true; }
    catch { return false; } // Private mode or a full quota: the shelf still works for this visit.
  };

  let recent = readRecent();
  let lastArgs = null;
  let repaintPending = false;
  let panel = null, activeCard = null, openTimer = 0, closeTimer = 0, frame = 0, suppressFocus = false, touchFocus = false;

  // Heading marks are shuffled once, per init, and handed to rows in first-seen order through a Map
  // keyed by row.id. A row therefore keeps the same mark across filters, favourites, renders and
  // repaints, and with thirteen marks against the eleven rows of a default browse no two visible
  // shelves share one. Extra rows (More classics chunks) wrap back around the shuffled list.
  const glyphOrder = shuffle(GLYPHS.slice());
  const glyphByRow = new Map();
  const glyphFor = rowId => {
    if (!glyphByRow.has(rowId)) glyphByRow.set(rowId, glyphOrder[glyphByRow.size % glyphOrder.length]);
    return glyphByRow.get(rowId);
  };

  // Both Continue playing rows are direct-launch rows: their cards anchor straight to #play/<id>
  // (the shared data-play handler) and never open the floating detail card. `rail` says which
  // progress rail the artwork carries: `sample` for the preview, `unavailable` for real history.
  const recentRow = () => {
    const items = recent.map(id => byId.get(id)).filter(Boolean).slice(0, RECENT_LIMIT);
    if (!items.length) return null;
    return { kind: 'recent', id: 'continue', title: 'Continue playing', subtitle: 'Reopen your recent launches.', games: items, direct: true, rail: 'unavailable' };
  };
  // Fresh browser, no real history yet: a fixed preview of launchable games. Computed here and
  // never written to storage, so it cannot masquerade as history — and it carries no badge, just
  // the plain shelf copy below, which says out loud that the rail is sample progress.
  const demoRow = () => {
    const launchable = list.filter(isPlayable);
    const ordered = DEMO_ORDER.map(id => launchable.find(game => game.id === id)).filter(Boolean);
    const items = [...ordered, ...launchable.filter(game => !ordered.includes(game))].slice(0, DEMO_LIMIT);
    if (!items.length) return null;
    return { kind: 'demo', id: 'continue-preview', title: 'Continue playing', subtitle: 'Start a game to begin your history. Sample progress shown.', games: items, direct: true, rail: 'sample' };
  };
  // Real launches always win: the preview only appears while this browser has no history at all.
  const continueRow = () => recentRow() || demoRow();
  const topRow = () => {
    const items = topGames(list, isPlayable);
    if (!items.length) return null;
    return { kind: 'top', id: 'top-games', title: 'Top games', subtitle: 'Ten editorial picks.', games: items, ranked: true };
  };
  const browseRows = () => [continueRow(), topRow(), ...curatedRows(list, isPlayable)].filter(Boolean);
  const browseMarkup = () => browseRows().map(shelfMarkup).join('');

  // Artwork for one card. The ranked Top games use the artwork worker's real portrait poster when
  // there is one; every other card (and any ranked game without a poster) uses the catalogue art.
  const artMarkup = (game, className, portrait = false) => {
    const src = (portrait ? portraitOf(game) : '') || (className === 'sd-img' ? game.art || game.heroArt : game.heroArt || game.art);
    if (src) return `<img class="${className}" src="${escape(src)}" alt="" loading="lazy" decoding="async">`;
    return `<span class="${className} sd-fallback" style="--cover:${escape(game.color || '#37452b')}">${escape(game.symbol || '+')}</span>`;
  };

  /** Rank 1..10 as SVG text in the numeral's own ink box (see RANK_VIEWBOX). The digit stays real
   *  text inside the SVG, so the numeral is still readable as text and needs no path data. */
  const rankMarkup = rank => {
    const ten = rank === 10;
    const text = ten
      ? `<text x="${RANK_TEXT_X}" y="700" text-anchor="end" font-size="1000" textLength="${RANK_TEN_LENGTH}" lengthAdjust="spacingAndGlyphs">${rank}</text>`
      : `<text x="${RANK_TEXT_X}" y="700" text-anchor="end" font-size="1000">${rank}</text>`;
    return `<span class="sd-rank${ten ? ' sd-rank-ten' : ''}" aria-hidden="true"><svg viewBox="${RANK_VIEWBOX}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${text}</svg></span>`;
  };

  /** The 3px progress rail under the preview artwork: an empty track with an optional lime fill. */
  const railMarkup = (percent, label) =>
    `<span class="sd-rail" role="img" aria-label="${escape(label)}"><span class="sd-rail-fill" style="width:${percent}%"></span></span>`;

  function cardMarkup(game, options = {}) {
    const { rank = 0, direct = false, progress = null, railLabel = '' } = options;
    const id = escape(game.id), title = escape(game.title);
    const status = isPlayable(game) ? '' : `<span class="sd-badge">${game.availability === 'sandbox-pending' ? 'Pending' : 'Unavailable'}</span>`;
    const rail = railLabel ? railMarkup(progress ?? 0, railLabel) : '';
    const rankMark = rank ? rankMarkup(rank) : '';
    // A Continue playing card is a real link into the player: same #play/<id> hash and data-play
    // hook the rest of the site uses, no aria-haspopup/expanded and no detail-card affordance.
    if (direct) {
      return `<article class="game-card sd-card" data-game="${id}" data-sd-direct="true">`
        + `<a class="game-art sd-art" href="#play/${id}" data-play="${id}" aria-label="Play ${title} in the gameflex player">`
        + artMarkup(game, 'sd-img') + status + rail
        + `</a>`
        + `<span class="sd-name">${PLAY_MARK}${title}</span>`
        + `</article>`;
    }
    const label = `${rank ? `Rank ${rank}, ` : ''}show details for ${title}, ${escape(game.genre)}`;
    // The name sits below the artwork in plain text; the button carries the accessible label. The
    // ranked row paints no name line at all — its rank and poster are the whole card, and the
    // button label still names the game for assistive tech.
    return `<article class="game-card sd-card${rank ? ' sd-ranked' : ''}" data-game="${id}">`
      + rankMark
      + `<button class="game-art sd-art" type="button" data-sd-open="${id}" aria-haspopup="dialog" aria-expanded="false" aria-label="${label}">`
      + artMarkup(game, 'sd-img', Boolean(rank)) + status
      + `</button>`
      + (rank ? '' : `<span class="sd-name">${title}</span>`)
      + `</article>`;
  }

  function shelfMarkup(row) {
    const heading = `sd-h-${row.id}`, label = escape(row.title);
    const count = String(row.games.length).padStart(2, '0');
    // Heading block: the mark owns the gutter column and is centred across BOTH rows, so it lines
    // up with the title-plus-subtitle block rather than the title line alone; the h3 takes the text
    // column's first row and the subtitle its second, with no padding of its own. The title text
    // stays in .sd-title-text with its count, which the QA hooks read directly.
    const cards = row.games.map((game, index) => cardMarkup(game, {
      rank: row.ranked ? index + 1 : 0,
      direct: Boolean(row.direct),
      progress: row.rail === 'sample' ? DEMO_PROGRESS[index] ?? 0 : 0,
      railLabel: row.rail === 'sample' ? 'Sample progress' : row.rail === 'unavailable' ? 'Gameplay progress unavailable' : '',
    })).join('');
    return `<section class="shelf sd-shelf" data-sd-shelf="${row.kind}" aria-labelledby="${heading}">`
      + `<div class="shelf-heading"><div class="sd-shelf-title"><span class="sd-glyph" aria-hidden="true">${glyphFor(row.id)}</span><h3 id="${heading}">`
      + `<span class="sd-title-text">${label} <small>${count}</small></span></h3>`
      + (row.subtitle ? `<p class="shelf-subtitle">${escape(row.subtitle)}</p>` : '')
      + `</div><div class="shelf-controls"><button class="shelf-arrow" type="button" data-scroll="${row.id}" data-direction="-1" aria-label="Scroll ${label} left by one game">‹</button>`
      + `<button class="shelf-arrow" type="button" data-scroll="${row.id}" data-direction="1" aria-label="Scroll ${label} right by one game">›</button></div></div>`
      + `<div class="game-row sd-row" id="row-${row.id}" tabindex="0" role="region" aria-labelledby="${heading}"${row.ranked ? ' data-portrait="true"' : ''}>${cards}</div>`
      + '</section>';
  }

  function gridMarkup(items, label) {
    return `<section class="sd-results" aria-label="${escape(label)}"><div class="sd-grid">${items.map(game => cardMarkup(game)).join('')}</div></section>`;
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
      ? `<a class="button lime sd-action" href="#play/${id}" data-play="${id}">Play Now</a>`
      : `<button class="button lime sd-action" type="button" data-play="${id}">View status</button>`;
    const meta = [game.genre, game.platform || 'Desktop'].filter(Boolean).map(escape).join(' · ');
    return `<div class="sd-panel" role="dialog" aria-modal="false" aria-label="${escape(game.title)}" tabindex="-1">`
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

  /** Cards on a direct-launch shelf (Continue playing) own no detail card. */
  const isDirect = card => card instanceof Element && card.hasAttribute('data-sd-direct');

  /**
   * Places the panel centred on the source card's THUMBNAIL rectangle — the artwork the visitor is
   * pointing at — not on the whole card, which would drag it down over the name line. It is clamped
   * into the viewport with a 12px margin and kept 12px below the site header's bottom edge, so it
   * never covers the navigation.
   */
  function position(card) {
    if (!panel || !card) return;
    const thumb = card.querySelector('.sd-art') || card;
    const rect = thumb.getBoundingClientRect();
    const width = panel.offsetWidth, height = panel.offsetHeight;
    if (rect.right < 0 || rect.left > window.innerWidth || rect.bottom < 0 || rect.top > window.innerHeight) { closePanel(); return; }
    const maxLeft = Math.max(12, window.innerWidth - width - 12);
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, maxLeft));
    const header = document.querySelector('.site-header');
    const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
    const minTop = Math.max(12, headerBottom + 12);
    const maxTop = Math.max(minTop, window.innerHeight - height - 12);
    const centred = rect.top + rect.height / 2 - height / 2;
    const top = Math.min(Math.max(centred, minTop), maxTop);
    // Which side of the thumbnail the panel ended up on decides where the pointer bridge sits.
    panel.dataset.flip = centred <= rect.top ? 'below' : 'above';
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
      // Continue playing cards are links into the player: they never carry aria-expanded.
      if (trigger && !isDirect(card)) trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus || hadFocus) {
        suppressFocus = true;
        trigger?.focus({ preventScroll: true });
        suppressFocus = false;
      }
    }
  }

  function openPanel(card, { focusPanel = false } = {}) {
    if (!card || !card.dataset.game || isDirect(card)) return;
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
    if (isDirect(card)) { armClose(); return; }
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
    if (card) {
      // A direct-launch card keeps the click: its own href/data-play handler opens the ready player.
      // Only a stale panel from another card is cleared here.
      if (isDirect(card)) { closePanel(); return; }
      openPanel(card);
      return;
    }
    if (panel && !event.target.closest('.sd-panel')) closePanel();
  };
  const onFocusIn = event => {
    if (suppressFocus || touchFocus) return;
    const card = event.target.closest?.('.sd-card');
    if (!card) { if (panel && !panel.contains(event.target)) closePanel(); return; }
    if (isDirect(card)) { if (panel && !panel.contains(event.target)) closePanel(); return; }
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

  /* ------------------------------------------------------- local launch history */

  const shelfHost = () => document.getElementById('shelves');
  const hashId = () => {
    const match = /^#play\/(.*)$/.exec(location.hash || '');
    return match && ID_PATTERN.test(match[1]) ? match[1] : '';
  };

  /**
   * Records a launch only when the shared player has actually put a frame in #player-stage for
   * a configured in-site game. Opening the ready panel, blocked or pending entries, unknown ids
   * and plain browsing are all ignored. Returns true when the list changed.
   */
  function rememberLaunch() {
    const stage = document.getElementById('player-stage');
    if (!stage?.querySelector('iframe.player-frame')) return false;
    const id = hashId();
    const game = id ? byId.get(id) : null;
    if (!game || !isPlayable(game)) return false;
    const next = [id, ...recent.filter(value => value !== id)].slice(0, RECENT_LIMIT);
    const changed = next.length !== recent.length || next.some((value, index) => value !== recent[index]);
    recent = next;
    writeRecent(next); // A storage failure keeps the in-session shelf rather than faking one.
    return changed;
  }

  /**
   * Re-renders the shelves after a launch, keeping focus on the same card of the same row.
   *
   * The repaint prepends a new "Continue playing" shelf, so the launched game's id now appears
   * outside the row the visitor was in as well. The row id is captured with the card, so focus
   * returns to the copy in its original row (matched by data-game) first and only falls back to
   * a whole-page match when that row no longer holds the game. Each row's horizontal scroll is
   * captured before the swap and re-applied after, so no row jumps back to its start. Restoring
   * focus is wrapped in suppressFocus: the focusin handler opens the detail panel, and a plain
   * focus() during a repaint would pop that panel open under a hovering pointer.
   */
  function repaint() {
    const host = shelfHost();
    if (!host || !lastArgs?.isBrowse) return;
    const active = document.activeElement;
    const focusedCard = active instanceof Element ? active.closest('.sd-card') : null;
    const insideHost = focusedCard ? host.contains(focusedCard) : false;
    const focusId = insideHost ? focusedCard.dataset.game || '' : '';
    const focusRow = insideHost ? focusedCard.closest('.sd-row')?.id || '' : '';
    const scrolls = rowScrolls(host);
    const html = browseMarkup();
    if (!html) return;
    host.innerHTML = html;
    restoreFocus(host, focusRow, focusId);
    restoreRowScrolls(host, scrolls);
    // app.js owns the arrow enabled/disabled state; a resize notification refreshes it without
    // touching focus, the player or the row scroll positions.
    try { window.dispatchEvent(new Event('resize')); } catch { /* Arrows keep their last state. */ }
  }

  /** Horizontal offset per row id, read before the shelves are replaced. */
  const rowScrolls = host => [...host.querySelectorAll('.sd-row')].map(row => [row.id, row.scrollLeft]);

  /** Puts every row back where it was; a row that no longer exists is simply skipped. */
  function restoreRowScrolls(host, scrolls) {
    for (const [id, left] of scrolls) {
      if (!id || !left) continue;
      const row = host.querySelector(`#${CSS_ESCAPE(id)}`);
      if (row) row.scrollLeft = left; // preventScroll focus keeps this manual position.
    }
  }

  /** Same row first, then any row: the original row's copy of the game wins over a newer duplicate. */
  function restoreFocus(host, rowId, gameId) {
    if (!gameId) return;
    const selector = `.sd-card[data-game="${CSS_ESCAPE(gameId)}"] .sd-art`;
    const row = rowId ? host.querySelector(`#${CSS_ESCAPE(rowId)}`) : null;
    const trigger = row?.querySelector(selector) || host.querySelector(selector);
    if (!trigger) return;
    suppressFocus = true;
    trigger.focus({ preventScroll: true });
    suppressFocus = false;
  }

  document.addEventListener('pointerover', onPointerOver, { passive: true });
  document.addEventListener('pointerout', onPointerOut, { passive: true });
  document.addEventListener('click', onClick);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerdown', onOutside, { passive: true });
  window.addEventListener('scroll', reposition, { passive: true, capture: true });
  window.addEventListener('resize', reposition);
  if ('MutationObserver' in window) {
    // A player frame only ever appears inside #player-stage, so this is the one honest signal
    // that a configured launch really started.
    const stage = document.getElementById('player-stage');
    if (stage) new MutationObserver(() => { if (rememberLaunch()) repaintPending = true; }).observe(stage, { childList: true, subtree: true });
    let playerWasOpen = document.documentElement.classList.contains('player-open');
    new MutationObserver(() => {
      const playerOpen = document.documentElement.classList.contains('player-open');
      if (playerOpen) closePanel();
      else if (playerWasOpen && repaintPending) { repaintPending = false; requestAnimationFrame(repaint); }
      playerWasOpen = playerOpen;
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  return {
    /** Renders the catalogue region. isBrowse → curated shelves, otherwise one grid. */
    render(args = {}) {
      closePanel();
      const view = typeof args?.view === 'string' ? args.view : 'discover';
      const category = typeof args?.category === 'string' ? args.category : 'all';
      const filtered = Array.isArray(args?.filtered) ? args.filtered : [];
      // Kept so a finished launch can refresh the shelves without app.js re-rendering them.
      lastArgs = { isBrowse: Boolean(args?.isBrowse), view, category };
      if (!filtered.length) return '';
      if (lastArgs.isBrowse) return browseMarkup();
      const label = view === 'favourites' ? 'Saved games' : category && category !== 'all' ? 'Filtered games' : 'Search results';
      return gridMarkup(filtered, label);
    },
    close: () => closePanel(),
  };
}

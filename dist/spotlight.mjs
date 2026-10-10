/**
 * Spotlight hero autoplay controller — spotlight.html only.
 *
 * app.js imports this module when <html> carries the page-spotlight class, and hands it
 * the hero API. The module owns every timer: one interval advances the carousel with the
 * hero fade, with no announcement and no focus movement, and it stands down while the
 * visitor hovers the hero, while focus sits inside it, while the tab is hidden, while the
 * hero is scrolled out of view, while the player or a dialog is open, while the visitor
 * has pressed the pause button, and whenever the system asks for reduced motion. The
 * pause button is the manual control WCAG 2.2.2 asks for; reduced motion never starts.
 *
 * The interval lives in spotlight.css (--spot-autoplay) so this module, the timer and the
 * progress fill all read one number.
 *
 * The spotlight page shows the *next three* games as small cover thumbnails in place of the
 * unnumbered progress pills. This module replaces the contents of #hero-dots with three
 * stable <button class="hero-thumb"> nodes at init and rewrites their data-hero-index,
 * artwork, label and tooltip on every hero change, so the existing app.js click delegate
 * ([data-hero-index]) and its arrow-key handler keep working untouched. A thin standalone
 * progress bar for the current slide sits above the strip and shares the same number and
 * pause states as the timer.
 *
 * Dependency: the thumbnail layer reads `hero.slides` (the game list). When the host does not
 * expose that getter the strip is left as the plain pills app.js built — nothing breaks.
 */
const FALLBACK_INTERVAL_MS = 7000;
const THUMB_COUNT = 3;

/** The next `count` slide indexes after `current`, wrapping once and never repeating. */
function upcomingIndexes(current, total, count) {
  const out = [];
  for (let step = 1; step <= total && out.length < count; step += 1) {
    const index = (((current + step) % total) + total) % total;
    if (!out.includes(index)) out.push(index);
  }
  return out;
}

function intervalMs() {
  const declared = getComputedStyle(document.documentElement).getPropertyValue('--spot-autoplay').trim();
  const match = /^([0-9.]+)(ms|s)$/.exec(declared);
  const value = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(value) || value <= 0) return FALLBACK_INTERVAL_MS;
  return match[2] === 's' ? value * 1000 : value;
}

export function initSpotlightHero({ hero, isBusy = () => false } = {}) {
  const root = document.getElementById('hero');
  const dots = document.getElementById('hero-dots');
  const pause = document.getElementById('hero-pause');
  if (!hero || !root || !dots || !pause || hero.total < 2) return null;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const state = { hover: false, focus: false, offscreen: false, hidden: document.visibilityState === 'hidden', reduced: motion.matches, manual: false };
  let timer = 0, remaining = intervalMs(), startedAt = 0;

  // --- Up-next thumbnails -------------------------------------------------------------
  // The strip holds exactly three stable nodes for the page's lifetime; only their
  // attributes change, so focus and the animation state never get thrown away.
  const slidesOf = () => { try { const list = hero.slides; return Array.isArray(list) ? list : []; } catch { return []; } };
  const artOf = game => (game && (game.heroArt || game.art)) || '';
  const thumbs = [];
  let fill = null, progress = null;

  const buildProgress = () => {
    progress = document.createElement('div');
    progress.className = 'hero-progress';
    const label = document.createElement('span');
    label.className = 'hero-progress-label';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = 'UP NEXT';
    const track = document.createElement('span');
    track.className = 'hero-progress-track';
    fill = document.createElement('span');
    fill.className = 'hero-progress-fill';
    track.appendChild(fill);
    progress.append(label, track);
    dots.insertAdjacentElement('beforebegin', progress);
  };

  const buildThumbs = () => {
    // Only take over the strip when the host gives us the games to name and illustrate.
    if (slidesOf().length < 2) return false;
    dots.textContent = '';
    for (let slot = 0; slot < THUMB_COUNT; slot += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hero-thumb';
      const image = document.createElement('img');
      image.className = 'hero-thumb-art';
      image.alt = '';
      image.decoding = 'async';
      image.loading = 'eager';
      image.draggable = false;
      button.appendChild(image);
      thumbs.push({ button, image });
      dots.appendChild(button);
    }
    dots.setAttribute('aria-label', 'Up next in the spotlight');
    buildProgress();
    return true;
  };

  const restartProgress = () => {
    if (!fill) return;
    fill.style.animation = 'none';
    void fill.offsetWidth; // force a reflow so the fill replays from zero
    fill.style.animation = '';
  };

  const syncThumbs = () => {
    if (!thumbs.length) return;
    const slides = slidesOf();
    const total = slides.length;
    if (!total) return;
    const indexes = upcomingIndexes(hero.index, total, Math.min(THUMB_COUNT, total));
    thumbs.forEach(({ button, image }, slot) => {
      const index = indexes[slot];
      const game = index === undefined ? null : slides[index];
      button.hidden = !game;
      if (!game) return;
      button.dataset.heroIndex = String(index);
      const art = artOf(game);
      if (art) { if (image.getAttribute('src') !== art) image.setAttribute('src', art); }
      else image.removeAttribute('src');
      image.hidden = !art;
      button.setAttribute('aria-label', `Show ${game.title}`);
      button.title = game.title;
      // app.js paints [data-hero-index] positionally against the current slide. The strip
      // only ever holds upcoming games, so undo that stamp and keep every thumb reachable.
      button.classList.remove('active');
      button.removeAttribute('aria-current');
      button.tabIndex = 0;
    });
  };

  if (buildThumbs()) syncThumbs();

  const paused = () => state.manual || state.hover || state.focus || state.offscreen || state.hidden || state.reduced;
  const paint = () => {
    dots.classList.toggle('is-paused', paused());
    dots.classList.toggle('is-static', state.reduced);
    if (progress) {
      progress.classList.toggle('is-paused', paused());
      progress.classList.toggle('is-static', state.reduced);
    }
  };
  const stop = () => {
    if (timer) remaining = Math.max(0, remaining - (performance.now() - startedAt));
    clearTimeout(timer); timer = 0;
  };
  const start = () => {
    stop();
    if (paused()) return;
    startedAt = performance.now();
    timer = setTimeout(() => { timer = 0; remaining = intervalMs(); step(); }, remaining);
  };
  function step() {
    // Advancing is silent: no live-region announcement and no focus change.
    if (!paused() && !isBusy()) hero.next({ announce: false });
    start();
  }
  const refresh = () => { paint(); start(); };

  root.addEventListener('mouseenter', () => { state.hover = true; refresh(); });
  root.addEventListener('mouseleave', () => { state.hover = false; refresh(); });
  root.addEventListener('focusin', () => { state.focus = true; refresh(); });
  root.addEventListener('focusout', event => {
    if (root.contains(event.relatedTarget)) return;
    state.focus = false; refresh();
  });
  document.addEventListener('visibilitychange', () => { state.hidden = document.visibilityState === 'hidden'; refresh(); });
  motion.addEventListener('change', event => { state.reduced = event.matches; refresh(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      entries.forEach(entry => { state.offscreen = !entry.isIntersecting; });
      refresh();
    }, { threshold: 0 }).observe(root);
  }

  pause.addEventListener('click', () => {
    state.manual = !state.manual;
    pause.setAttribute('aria-pressed', String(state.manual));
    pause.setAttribute('aria-label', state.manual ? 'Play the spotlight slideshow' : 'Pause the spotlight slideshow');
    refresh();
  });

  // A manual change restarts the countdown so the fill matches the next advance, and the
  // up-next strip re-points at the three games that follow the new current slide.
  hero.onChange?.(() => {
    stop(); remaining = intervalMs(); if (!paused()) start();
    syncThumbs(); restartProgress();
  });

  refresh();
  return { paused, intervalMs: intervalMs(), state };
}

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
 * progress fill on the active pill all read one number.
 */
const FALLBACK_INTERVAL_MS = 7000;

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

  const paused = () => state.manual || state.hover || state.focus || state.offscreen || state.hidden || state.reduced;
  const paint = () => {
    dots.classList.toggle('is-paused', paused());
    dots.classList.toggle('is-static', state.reduced);
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

  // A manual change restarts the countdown so the fill matches the next advance.
  hero.onChange?.(() => { stop(); remaining = intervalMs(); if (!paused()) start(); });

  refresh();
  return { paused, intervalMs: intervalMs(), state };
}

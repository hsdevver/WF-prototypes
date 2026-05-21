import { wireSecretChapterTrigger } from './cheat-panel.js';
import {
  initIntroActivityLog,
  recordPlayActivity,
  syncIntroSideColumnLayout
} from './intro-activity-log.js';
import { initTheme } from './theme.js';
import { initAmbientMusicSync, initAmbientPlayback } from './ambient-music.js';
import {
  anchorFromRect,
  applySubwayLaneBundles,
  applySubwayMidXLanes,
  sortSubwayCordPaintOrder,
  cordPathD,
  cordPhaseOffset,
  edgeKey,
  subwayCordPathD
} from './cord-paths.js';
import {
  EMPATHY_SCORE_CEIL,
  EMPATHY_SCORE_FLOOR,
  hasPerfectStars,
  starsForModule
} from './empathy-score.js';
import {
  CHAPTER_1_END_MODULE_ID,
  CHAPTER_2_END_MODULE_ID,
  getChapterAriaLabel,
  getPathRouteVariants,
  MODULE_SKILL_FOCUS
} from './consequence-flow.js';
import {
  applyPlayOutcome,
  beginChapter2,
  beginChapter3,
  wouldBlockStarGateUnlock,
  getChapterCordAnchors,
  getChapterEdges,
  getCurrentChapter,
  getEdgeChoiceLabel,
  getFilledEdgeKeys,
  getRuntimeModule,
  getRuntimeModules,
  getCorporateVolumeCheatMode,
  isChapter1Complete,
  isChapter2Complete,
  isChapter3HandoffDone,
  isChapterHandoffDone,
  isEdgeFilled,
  playModeBeforeOutcome,
  setCatalogChapter,
  setCorporateVolumeCheatMode
} from './consequence-progress.js';
import { initModuleModal, isModuleModalOpen, openModuleModal } from './module-modal.js';
import {
  applyFolderChrome,
  createModuleThumbLabel,
  getModuleLayout,
  refreshFolderChrome,
  syncModuleThumbLabel
} from './module-layout.js';
import { playModuleHoverClick } from './ui-sounds.js';

/** Subtle tilt/offset per cell — grid slots, satellite scatter feel */
const INTRO_MODULE_SCATTER = {
  m1: { x: -10, y: 12, r: -3.2, z: 3 },
  m2: { x: 8, y: -8, r: 2.8, z: 2 },
  m6: { x: -12, y: 7, r: -2.5, z: 1 },
  m8: { x: 6, y: -4, r: 1.6, z: 1 },
  m4: { x: 11, y: -10, r: 3.2, z: 0 },
  m5: { x: -7, y: 11, r: -1.6, z: 2 },
  c2m1: { x: -6, y: 5, r: -2.2, z: 2 },
  c2m2: { x: 5, y: -4, r: 2.4, z: 1 },
  c2m3: { x: 8, y: 6, r: -1.8, z: 0 },
  c3m1: { x: -8, y: 10, r: -2.8, z: 3 },
  c3m2a: { x: 7, y: -9, r: 2.6, z: 2 },
  c3m2b: { x: -10, y: 8, r: -2.4, z: 1 },
  c3m3a: { x: 9, y: -6, r: 2.2, z: 2 },
  c3m3: { x: -5, y: 4, r: -1.4, z: 1 },
  c3m3b: { x: 8, y: 7, r: 2.8, z: 0 },
  c3m4: { x: -6, y: -5, r: -2, z: 2 },
  c3m5: { x: 5, y: 9, r: 1.6, z: 1 }
};

function isCorporateSkin() {
  return document.documentElement.dataset.skin === 'corporate';
}

function isSpaceSkin() {
  return document.documentElement.dataset.skin === 'space';
}

function usesIntroSidePanel() {
  return isCorporateSkin() || isSpaceSkin();
}

function dissolveCorporatePathStacks() {
  if (!gridEl) return;
  gridEl.querySelectorAll('.intro-path-stack').forEach((stack) => {
    while (stack.firstChild) {
      gridEl.appendChild(stack.firstChild);
    }
    stack.remove();
  });
}

/** Spine cols on one row; branch col stacks 3A/3B with gap = 1.5× column gap. */
function applyCorporateModuleGridLayout() {
  if (!isCorporateSkin() || !gridEl) return;

  dissolveCorporatePathStacks();

  const byColumn = new Map();
  getRuntimeModules().forEach((mod) => {
    if (!byColumn.has(mod.column)) byColumn.set(mod.column, []);
    byColumn.get(mod.column).push(mod);
  });

  byColumn.forEach((colMods, column) => {
    const sorted = [...colMods].sort((a, b) => a.row - b.row);

    if (sorted.length === 1) {
      const wrap = gridEl.querySelector(`[data-module-anchor="${sorted[0].id}"]`);
      if (!wrap) return;
      wrap.classList.remove(
        'intro-module-wrap--stacked',
        'intro-module-wrap--stack-top',
        'intro-module-wrap--stack-bottom'
      );
      wrap.classList.add('intro-module-wrap--solo');
      wrap.style.gridColumn = String(column);
      wrap.style.gridRow = '1';
      return;
    }

    const stack = document.createElement('div');
    stack.className = 'intro-path-stack intro-path-stack--branch';
    stack.dataset.stackColumn = String(column);
    stack.style.gridColumn = String(column);
    stack.style.gridRow = '1';
    gridEl.appendChild(stack);

    sorted.forEach((mod, index) => {
      const wrap = gridEl.querySelector(`[data-module-anchor="${mod.id}"]`);
      if (!wrap) return;
      wrap.classList.remove('intro-module-wrap--solo');
      wrap.classList.add('intro-module-wrap--stacked');
      wrap.classList.toggle('intro-module-wrap--stack-top', index === 0);
      wrap.classList.toggle('intro-module-wrap--stack-bottom', index === sorted.length - 1);
      wrap.style.gridColumn = '';
      wrap.style.gridRow = '';
      stack.appendChild(wrap);
    });
  });

  const hasBranching = Boolean(gridEl.querySelector('.intro-path-stack--branch'));
  const linearCols = byColumn.size;
  const board = document.getElementById('intro-corporate-board');
  board?.classList.toggle('is-path-linear', !hasBranching);
  pathMapEl?.classList.toggle('is-path-linear', !hasBranching);
  gridEl?.classList.toggle('is-path-linear', !hasBranching);
  if (!hasBranching && linearCols > 0) {
    gridEl?.style.setProperty('--path-linear-cols', String(linearCols));
  } else {
    gridEl?.style.removeProperty('--path-linear-cols');
  }
}

function applyModuleScatter(wrap, moduleId) {
  if (isCorporateSkin()) {
    wrap.style.setProperty('--scatter-x', '0px');
    wrap.style.setProperty('--scatter-y', '0px');
    wrap.style.setProperty('--scatter-rotate', '0deg');
    wrap.style.removeProperty('z-index');
    return;
  }
  const s = INTRO_MODULE_SCATTER[moduleId] ?? { x: 0, y: 0, r: 0, z: 0 };
  wrap.style.setProperty('--scatter-x', `${s.x}px`);
  wrap.style.setProperty('--scatter-y', `${s.y}px`);
  wrap.style.setProperty('--scatter-rotate', `${s.r}deg`);
  wrap.style.setProperty('--float-delay', ((cordPhaseOffset(moduleId) % 40) / 10).toFixed(2));
  wrap.style.setProperty(
    '--float-duration',
    (3.6 + (cordPhaseOffset(`${moduleId}-dur`) % 28) / 10).toFixed(2)
  );
  wrap.style.setProperty(
    '--float-amp',
    (2 + (cordPhaseOffset(`${moduleId}-amp`) % 35) / 10).toFixed(2)
  );
  if (s.z) wrap.style.zIndex = String(s.z);
}

const STAR_SVG =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M6 1.2 7.47 4.18l3.29.48-2.38 2.32.56 3.27L6 8.3l-2.94 1.55.56-3.27-2.38-2.32 3.29-.48z"/></svg>';

const DIAMOND_SVG =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M6 .75 10.5 6 6 11.25 1.5 6z"/></svg>';

const PADLOCK_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="lock-shackle" fill="none" stroke="currentColor" stroke-width="2" d="M8 11V8a4 4 0 0 1 8 0v3"/><rect class="lock-body" fill="currentColor" x="5" y="11" width="14" height="9" rx="2"/></svg>';

/** Intro timeline 0→1 — auto-play and scroll scrub share this. */
const INTRO_SPACE = {
  heroEnd: 0.1,
  dollyStart: 0.1,
  dollyEnd: 0.78,
  chapterRevealStart: 0.28,
  chapterRevealEnd: 0.78,
  /** Keep camera on the chapter beat; modules pop in place (no second pan to path-map center). */
  modulesCameraStart: 1,
  modulesSettleDelayMs: 1600,
  moduleStaggerMs: 180,
  /** Scroll progress after dollyEnd that reveals modules (mirrors delay + stagger). */
  moduleHoldProgress: 0.045,
  moduleStaggerProgress: 0.014,
  wheelStep: 0.00042,
  phases: [
    { progressEnd: 0.1, durationMs: 4200 },
    { progressEnd: 0.78, durationMs: 10_500 },
    { progressEnd: 0.78, durationMs: 1600, hold: true },
    { progressEnd: 1, durationMs: 6 * 180 + 120 + 400 }
  ]
};

const INTRO_CORPORATE = {
  heroEnd: 0.06,
  dollyStart: 0.06,
  dollyEnd: 0.52,
  chapterRevealStart: 0.06,
  chapterRevealEnd: 0.52,
  modulesCameraStart: 0.58,
  modulesSettleDelayMs: 900,
  moduleStaggerMs: 140,
  moduleHoldProgress: 0.04,
  moduleStaggerProgress: 0.012,
  wheelStep: 0.00055,
  phases: [
    { progressEnd: 0.52, durationMs: 3200 },
    { progressEnd: 0.52, durationMs: 700, hold: true },
    { progressEnd: 0.92, durationMs: 6 * 140 + 100 },
    { progressEnd: 1, durationMs: 600 }
  ]
};

function introCfg() {
  return isCorporateSkin() ? INTRO_CORPORATE : INTRO_SPACE;
}

const introState = {
  progress: 0,
  complete: false,
  autoDriving: false,
  autoStartMs: 0,
  autoRaf: 0,
  stops: null,
  chapterSettledAt: null,
  moduleSoundsPlayed: new Set(),
  pluggingEdge: null,
  plugActive: false,
  plugRaf: 0,
  handoffRunning: false,
  chapter2SettledAt: null,
  corporateViewVolume: 1,
  nextPlayModuleId: null
};

let corporatePopRun = 0;

const CORPORATE_POP = {
  stepMs: 420,
  moduleStaggerMs: 140
};

const CORPORATE_VOLUME_COPY = {
  1: {
    title: 'Volume 1: Getting started',
    lead:
      'Your walk-through for this volume—what each module is for, how they connect, and what to try first. Same energy as the laminated sheet by the copier: read once, then you’re set.'
  },
  2: {
    title: 'Volume 2: Almost a pro',
    lead:
      'Shorter lane, sharper pacing—three modules in a row. Your choices branch less; the tubes stay lit as you move.'
  },
  3: {
    title: 'Volume 3: Full weave',
    lead:
      'Split, merge, and branch in one column—3A and 3B sit with chapter 3, then everything converges before the final gate.'
  }
};

const CORPORATE_HANDOFF = {
  cordShineMs: 650,
  pathSlamMs: 720,
  navWiggleMs: 380,
  navSlamMs: 520,
  mainExitMs: 780,
  mainEnterMs: 820,
  moduleStaggerMs: 130
};

function shouldFreezeModuleReveal() {
  return Boolean(
    introState.pluggingEdge ||
    introState.plugActive ||
    introState.handoffRunning ||
    isModuleModalOpen()
  );
}

function syncPlugActiveClass() {
  document.documentElement.classList.toggle(
    'is-plug-active',
    Boolean(introState.pluggingEdge || introState.plugActive)
  );
}

/** Depth parallax — lower = slower drift (further away). */
const SKY_PARALLAX = {
  base: 0.22,
  glow: 0.38,
  dust: 0.52,
  starsFar: 0.58,
  starsMid: 0.76,
  starsNear: 0.92
};

const viewport = document.getElementById('viewport');
const stage = document.getElementById('stage');
const rail = document.getElementById('rail');
const chapterSection1 = document.querySelector('[data-chapter="1"]');
const chapterSection2 = document.querySelector('[data-chapter="2"]');
const nextChapterBtn = document.getElementById('intro-next-chapter');
const poofEl = document.getElementById('intro-poof');

let gridEl = document.getElementById('intro-columns');
let pathMapEl = document.getElementById('intro-path-map');
let connectorsEl = document.getElementById('intro-connectors');
let chapterEl = chapterSection1?.querySelector('.intro-chapter') ?? null;

function cordAnchorsForKey(key) {
  return getChapterCordAnchors()[key] ?? { from: 'right', to: 'left' };
}

function setActiveChapter(chapter) {
  const board = document.getElementById('intro-corporate-board');
  if (chapter === 2 && !isCorporateSkin()) {
    gridEl = document.getElementById('intro-columns-c2');
    pathMapEl = document.getElementById('intro-path-map-c2');
    connectorsEl = document.getElementById('intro-connectors-c2');
    chapterEl = chapterSection2?.querySelector('.intro-chapter') ?? null;
  } else {
    gridEl = document.getElementById('intro-columns');
    pathMapEl = document.getElementById('intro-path-map');
    connectorsEl = document.getElementById('intro-connectors');
    chapterEl = chapterSection1?.querySelector('.intro-chapter') ?? null;
  }
  if (isCorporateSkin()) {
    board?.classList.toggle('is-volume-2', chapter === 2);
  }
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function imageUrlFor(mod) {
  return `https://picsum.photos/seed/wf-${mod.id}/400/320`;
}

function renderStars(count) {
  const el = document.createElement('div');
  el.className = 'module-stars';
  el.setAttribute('aria-hidden', count ? 'false' : 'true');
  if (count) el.setAttribute('aria-label', `${count} of 5 stars`);
  for (let i = 0; i < 5; i++) {
    const star = document.createElement('span');
    star.className = `module-star${i < count ? ' is-filled' : ''}`;
    star.innerHTML = STAR_SVG;
    el.appendChild(star);
  }
  return el;
}

function syncStarsElement(starsEl, count) {
  starsEl.querySelectorAll('.module-star').forEach((star, i) => {
    star.classList.toggle('is-filled', i < count);
  });
  starsEl.setAttribute('aria-hidden', count ? 'false' : 'true');
  if (count) starsEl.setAttribute('aria-label', `${count} of 5 stars`);
  else starsEl.removeAttribute('aria-label');
}

function renderDiamondBadge() {
  const el = document.createElement('span');
  el.className = 'module-diamond-badge';
  el.setAttribute('aria-label', 'Perfect empathy score');
  el.innerHTML = DIAMOND_SVG;
  return el;
}

function syncDiamondBadge(thumb, mod) {
  let badge = thumb.querySelector('.module-diamond-badge');
  if (hasPerfectStars(mod)) {
    if (!badge) thumb.appendChild(renderDiamondBadge());
  } else {
    badge?.remove();
  }
}

function focusModuleCard(moduleId) {
  gridEl?.querySelectorAll('.module-card').forEach((c) => c.classList.remove('is-focused'));
  const card = gridEl?.querySelector(`[data-module-id="${moduleId}"]`);
  card?.classList.add('is-focused');
  return card;
}

/** First unlocked, incomplete module to suggest as the next play target. */
function resolveNextPlayModuleId() {
  const stored = introState.nextPlayModuleId;
  if (stored) {
    const mod = getRuntimeModule(stored);
    if (mod && !mod.locked && !mod.completed) return stored;
  }

  const candidates = getRuntimeModules().filter((m) => !m.locked && !m.completed);
  if (!candidates.length) return null;

  const start = candidates.find((m) => m.start);
  if (start) return start.id;

  return (
    candidates.sort((a, b) => b.column - a.column || a.row - b.row || 0)[0]?.id ?? null
  );
}

function syncNextPlayModuleGlow() {
  if (!gridEl) return;
  gridEl.querySelectorAll('.intro-module-wrap--next-play').forEach((wrap) => {
    wrap.classList.remove('intro-module-wrap--next-play');
  });

  const nextId = resolveNextPlayModuleId();
  if (!nextId) {
    introState.nextPlayModuleId = null;
    return;
  }

  introState.nextPlayModuleId = nextId;
  gridEl.querySelector(`[data-module-anchor="${nextId}"]`)?.classList.add('intro-module-wrap--next-play');
}

function setNextPlayModule(moduleId) {
  if (!moduleId) {
    introState.nextPlayModuleId = null;
    syncNextPlayModuleGlow();
    return;
  }
  const mod = getRuntimeModule(moduleId);
  if (!mod || mod.locked || mod.completed) {
    introState.nextPlayModuleId = null;
    syncNextPlayModuleGlow();
    return;
  }
  introState.nextPlayModuleId = moduleId;
  syncNextPlayModuleGlow();
}

function refreshNextPlayAfterProgress(playedModuleId, newlyUnlocked = []) {
  if (newlyUnlocked.length) {
    setNextPlayModule(newlyUnlocked[newlyUnlocked.length - 1]);
    return;
  }
  const played = getRuntimeModule(playedModuleId);
  if (played?.completed) introState.nextPlayModuleId = null;
  syncNextPlayModuleGlow();
}

function highlightUnlockedModules(moduleIds) {
  for (const id of moduleIds) {
    const wrap = pathMapEl?.querySelector(`[data-module-anchor="${id}"]`);
    wrap?.classList.add('intro-module-wrap--just-unlocked');
    window.setTimeout(() => wrap?.classList.remove('intro-module-wrap--just-unlocked'), 1200);
  }
  const focusId = moduleIds[moduleIds.length - 1] ?? moduleIds[0];
  if (focusId) {
    setNextPlayModule(focusId);
    focusModuleCard(focusId);
  }
}

let starGatePromptModuleId = null;

function clearModuleStarGatePrompt() {
  if (!starGatePromptModuleId) return;
  const wrap = gridEl?.querySelector(`[data-module-anchor="${starGatePromptModuleId}"]`);
  wrap?.classList.remove('is-star-gate-prompt');
  wrap?.querySelector('.intro-module-star-gate-tooltip')?.remove();
  starGatePromptModuleId = null;
}

function showModuleStarGatePrompt(moduleId) {
  const wrap = gridEl?.querySelector(`[data-module-anchor="${moduleId}"]`);
  if (!wrap) return;

  clearModuleStarGatePrompt();
  starGatePromptModuleId = moduleId;
  wrap.classList.add('is-star-gate-prompt');

  const tip = document.createElement('div');
  tip.className = 'intro-module-star-gate-tooltip';
  tip.setAttribute('role', 'status');
  tip.textContent = 'Need a higher score to unlock the next chapter';
  wrap.appendChild(tip);

  window.setTimeout(() => tip.classList.add('is-visible'), 480);
}

function onModuleProgress(unlockedIds, moduleId, { starGateBlocked = false } = {}) {
  if (!introState.plugActive) {
    patchModulesFromRuntime(unlockedIds);
    queueIntroCordLayout();
  }
  highlightUnlockedModules(unlockedIds);
  if (!unlockedIds.length) refreshNextPlayAfterProgress(moduleId, unlockedIds);
  refreshLeaderboardPanel();
  syncPlayerProfile();
  startCordFloat();

  if (starGateBlocked) {
    showModuleStarGatePrompt(moduleId);
  } else if (moduleId === 'm8' || starGatePromptModuleId === 'm8') {
    clearModuleStarGatePrompt();
    patchModulesFromRuntime(unlockedIds);
    queueIntroCordLayout();
  }

  maybeStartChapterHandoff(moduleId);
}

function maybeStartChapterHandoff(moduleId) {
  if (introState.handoffRunning) return;

  if (moduleId === CHAPTER_1_END_MODULE_ID) {
    if (!isChapter1Complete() || isChapterHandoffDone()) return;
    if (isCorporateSkin()) {
      window.setTimeout(() => runCorporateChapterHandoff(), 480);
      return;
    }
    if (!chapterSection2) return;
    window.setTimeout(() => runChapterHandoff(), 480);
    return;
  }

  if (moduleId === CHAPTER_2_END_MODULE_ID) {
    if (!isChapter2Complete() || isChapter3HandoffDone()) return;
    if (isCorporateSkin()) {
      window.setTimeout(() => runCorporateVolume3Handoff(), 480);
    }
  }
}

function getCorporateNavItem(volume) {
  return document.querySelector(`.intro-corporate-nav__item[data-volume="${volume}"]`);
}

function updateCorporateVolumeCopy(volume) {
  const copy = CORPORATE_VOLUME_COPY[volume];
  const board = document.getElementById('intro-corporate-board');
  const title = board?.querySelector('.intro-corporate-board__title');
  const lead = board?.querySelector('.intro-corporate-board__lead');
  if (copy?.title && title) title.textContent = copy.title;
  if (copy?.lead && lead) lead.textContent = copy.lead;
}

const CORPORATE_NAV_LOCK_SVG = `<svg viewBox="0 0 24 24" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" d="M8 11V8a4 4 0 0 1 8 0v3"/><rect fill="currentColor" x="5" y="11" width="14" height="9" rx="2"/></svg>`;

function getAccessibleCorporateVolumes() {
  const cheat = getCorporateVolumeCheatMode();
  if (cheat === 'all') return [1, 2, 3];
  if (cheat === 'locked') return [1];

  const progress = getCurrentChapter();
  const volumes = [1];
  if (progress >= 2 || (isChapterHandoffDone() && isChapter1Complete())) volumes.push(2);
  if (progress >= 3 || (isChapter3HandoffDone() && isChapter2Complete())) volumes.push(3);
  return volumes;
}

/** Keep volume nav buttons aligned with progress (DOM can stay unlocked after reset). */
function syncCorporateVolumeNavLocks() {
  const cheat = getCorporateVolumeCheatMode();
  if (cheat === 'all') {
    for (const v of [1, 2, 3]) activateCorporateVolumeNav(v);
    return;
  }
  if (cheat === 'locked') {
    lockCorporateVolumeNav(2);
    lockCorporateVolumeNav(3);
    return;
  }
  lockCorporateVolumeNav(2);
  lockCorporateVolumeNav(3);
  const progress = getCurrentChapter();
  if (progress >= 2 || (isChapterHandoffDone() && isChapter1Complete())) activateCorporateVolumeNav(2);
  if (progress >= 3 || (isChapter3HandoffDone() && isChapter2Complete())) activateCorporateVolumeNav(3);
}

function lockCorporateVolumeNav(volume) {
  const item = getCorporateNavItem(volume);
  if (!item || volume === 1) return;
  item.disabled = true;
  item.classList.add('is-locked');
  item.removeAttribute('aria-current');
  item.setAttribute('aria-label', `Volume ${volume} (locked)`);
  if (!item.querySelector('.intro-corporate-nav__lock')) {
    const lock = document.createElement('span');
    lock.className = 'intro-corporate-nav__lock';
    lock.setAttribute('aria-hidden', 'true');
    lock.innerHTML = CORPORATE_NAV_LOCK_SVG;
    item.insertBefore(lock, item.firstChild);
  }
}

function applyCorporateVolumeCheatUi() {
  if (!usesIntroSidePanel()) return;

  syncCorporateVolumeNavLocks();

  const mode = getCorporateVolumeCheatMode();
  const allowed = getAccessibleCorporateVolumes();
  if (mode === 'locked') {
    setCorporateViewVolume(1, { animate: false });
  } else if (!allowed.includes(getCorporateViewVolume())) {
    setCorporateViewVolume(allowed[0], { animate: false });
  }

  document
    .getElementById('modules')
    ?.classList.toggle('is-volume-swipeable', allowed.length > 1);
  syncCorporateVolumeNavActive();
}

function getCorporateViewVolume() {
  const allowed = getAccessibleCorporateVolumes();
  const view = introState.corporateViewVolume ?? getCurrentChapter();
  return allowed.includes(view) ? view : allowed[0];
}

function syncCorporateVolumeNavActive() {
  const nav = document.querySelector('.intro-corporate-nav');
  const view = getCorporateViewVolume();
  const progress = getCurrentChapter();
  nav?.querySelectorAll('.intro-corporate-nav__item').forEach((btn) => {
    const v = Number(btn.dataset.volume);
    if (!v) return;
    btn.classList.toggle('is-active', v === view);
    btn.classList.toggle(
      'is-complete',
      v < progress ||
        (v === 1 && isChapterHandoffDone()) ||
        (v === 2 && isChapter3HandoffDone())
    );
    if (v === view) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
}

function setCorporateViewVolume(volume, { animate = true } = {}) {
  if (!usesIntroSidePanel()) return;
  const allowed = getAccessibleCorporateVolumes();
  if (!allowed.includes(volume)) return;

  const prev = getCorporateViewVolume();
  if (prev === volume) return;

  introState.corporateViewVolume = volume;
  setCatalogChapter(volume);
  setActiveChapter(volume);
  updateCorporateVolumeCopy(volume);
  syncCorporateVolumeNavActive();
  clearModulePathHover();

  const modulesEl = document.getElementById('modules');
  const pathMap = document.getElementById('intro-path-map');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slideDir = volume > prev ? 1 : -1;

  if (animate && !reduced && modulesEl && pathMap) {
    modulesEl.classList.add('is-volume-switching');
    pathMap.classList.add(slideDir > 0 ? 'is-volume-enter-from-right' : 'is-volume-enter-from-left');
    renderModules();
    queueIntroCordLayout();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        pathMap.classList.remove('is-volume-enter-from-right', 'is-volume-enter-from-left');
        window.setTimeout(() => modulesEl.classList.remove('is-volume-switching'), 400);
      });
    });
    return;
  }

  renderModules();
  queueIntroCordLayout();
}

function activateCorporateVolumeNav(volume) {
  const item = getCorporateNavItem(volume);
  if (!item) return;
  item.disabled = false;
  item.classList.remove('is-locked');
  item.setAttribute('aria-label', `Volume ${volume}`);
  item.querySelector('.intro-corporate-nav__lock')?.remove();
  syncCorporateVolumeNavActive();
}

const CORPORATE_VOLUME_DRAG_THRESHOLD_PX = 52;
let corporateVolumeDragBound = false;
let corporateVolumeDragConsumed = false;

function wireCorporateVolumeNav() {
  const nav = document.querySelector('.intro-corporate-nav');
  if (!nav || nav.dataset.volumeNavBound) return;
  nav.dataset.volumeNavBound = '1';

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.intro-corporate-nav__item');
    if (!btn || btn.disabled || btn.classList.contains('is-locked')) return;
    const vol = Number(btn.dataset.volume);
    if (!vol) return;
    const allowed = getAccessibleCorporateVolumes();
    if (!allowed.includes(vol)) return;
    setCorporateViewVolume(vol);
  });
}

function wireCorporateVolumeDrag() {
  const modulesEl = document.getElementById('modules');
  if (!modulesEl || corporateVolumeDragBound) return;
  corporateVolumeDragBound = true;

  let startX = 0;
  let dragging = false;
  let pointerId = null;

  const canSwipe = () => usesIntroSidePanel() && getAccessibleCorporateVolumes().length > 1;

  const endDrag = (e) => {
    if (pointerId != null && e.pointerId !== pointerId) return;

    modulesEl.classList.remove('is-volume-dragging');
    modulesEl.style.removeProperty('--volume-drag-offset');

    if (dragging) {
      corporateVolumeDragConsumed = true;
      const dx = e.clientX - startX;
      const volumes = getAccessibleCorporateVolumes();
      const idx = volumes.indexOf(getCorporateViewVolume());
      if (dx < -CORPORATE_VOLUME_DRAG_THRESHOLD_PX && idx < volumes.length - 1) {
        setCorporateViewVolume(volumes[idx + 1]);
      } else if (dx > CORPORATE_VOLUME_DRAG_THRESHOLD_PX && idx > 0) {
        setCorporateViewVolume(volumes[idx - 1]);
      }
    }

    dragging = false;
    pointerId = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  };

  const onPointerMove = (e) => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    if (!dragging && Math.abs(dx) > 10) {
      dragging = true;
      modulesEl.classList.add('is-volume-dragging');
      try {
        modulesEl.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    }
    if (dragging) {
      const volumes = getAccessibleCorporateVolumes();
      const idx = volumes.indexOf(getCorporateViewVolume());
      let dragDx = dx;
      if (idx <= 0) dragDx = Math.max(0, dragDx);
      if (idx >= volumes.length - 1) dragDx = Math.min(0, dragDx);
      const damped = Math.max(-72, Math.min(72, dragDx * 0.35));
      modulesEl.style.setProperty('--volume-drag-offset', `${damped}px`);
    }
  };

  const onPointerUp = (e) => {
    endDrag(e);
  };

  modulesEl.addEventListener(
    'click',
    (e) => {
      if (!corporateVolumeDragConsumed) return;
      corporateVolumeDragConsumed = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );

  modulesEl.addEventListener('pointerdown', (e) => {
    if (!canSwipe() || e.button !== 0) return;
    if (introState.handoffRunning || introState.plugActive) return;

    corporateVolumeDragConsumed = false;
    startX = e.clientX;
    dragging = false;
    pointerId = e.pointerId;

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
    window.addEventListener('pointercancel', onPointerUp, { once: true });
  });
}

function finishCorporateHandoffContent() {
  const board = document.getElementById('intro-corporate-board');
  const vol1Nav = getCorporateNavItem(1);
  vol1Nav?.classList.remove('is-active');
  vol1Nav?.classList.add('is-complete');
  vol1Nav?.removeAttribute('aria-current');

  beginChapter2();
  introState.corporateViewVolume = 2;
  setCatalogChapter(2);
  setActiveChapter(2);
  updateCorporateVolumeCopy(2);
  renderModules();
  applyCorporateModuleGridLayout();
  activateCorporateVolumeNav(2);
  board?.classList.add('is-pop-complete');
  gridEl?.querySelectorAll('.intro-module-wrap').forEach((wrap) => {
    wrap.classList.remove('is-revealed', 'is-pop-visible');
  });
}

async function revealCorporateVolume2Modules() {
  const modules = getRuntimeModules();
  for (const mod of modules) {
    const wrap = gridEl?.querySelector(`[data-module-anchor="${mod.id}"]`);
    if (!wrap) continue;
    wrap.classList.add('is-revealed', 'is-pop-visible');
    if (!introState.moduleSoundsPlayed.has(mod.id)) {
      introState.moduleSoundsPlayed.add(mod.id);
      playModuleHoverClick({ bypassThrottle: true });
    }
    await delayMs(CORPORATE_HANDOFF.moduleStaggerMs);
  }
}

async function runCorporateChapterHandoff() {
  if (!isCorporateSkin() || introState.handoffRunning || isChapterHandoffDone()) return;
  introState.handoffRunning = true;
  clearModulePathHover();
  document.documentElement.classList.add('is-corporate-handoff', 'is-intro-handoff');
  stopCordFloat();
  stopIntroAuto();

  const board = document.getElementById('intro-corporate-board');
  const body = board?.querySelector('.intro-corporate-board__body');
  const main = board?.querySelector('.intro-corporate-board__main');
  const pathMap = document.getElementById('intro-path-map');
  const connectors = document.getElementById('intro-connectors');
  const vol2Nav = getCorporateNavItem(2);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finishCorporateHandoffContent();
    queueIntroCordLayout();
    startCordFloat();
    introState.handoffRunning = false;
    document.documentElement.classList.remove('is-corporate-handoff', 'is-intro-handoff');
    return;
  }

  body?.classList.add('is-handoff-active');

  connectors?.classList.add('is-volume-complete-glow');
  pathMap?.classList.add('is-cord-shine');
  await delayMs(CORPORATE_HANDOFF.cordShineMs);

  pathMap?.classList.add('is-chapter-path-slam');
  await delayMs(CORPORATE_HANDOFF.pathSlamMs);
  pathMap?.classList.remove('is-chapter-path-slam', 'is-cord-shine');
  connectors?.classList.remove('is-volume-complete-glow');

  if (vol2Nav) {
    vol2Nav.classList.add('is-nav-unlocking');
    await delayMs(CORPORATE_HANDOFF.navWiggleMs);
    vol2Nav.classList.add('is-nav-slamming');
    await delayMs(CORPORATE_HANDOFF.navSlamMs);
    activateCorporateVolumeNav(2);
    vol2Nav.classList.remove('is-nav-unlocking', 'is-nav-slamming');
  }

  main?.classList.add('is-main-exiting');
  await delayMs(CORPORATE_HANDOFF.mainExitMs);

  finishCorporateHandoffContent();
  main?.classList.remove('is-main-exiting');
  main?.classList.add('is-main-entering');
  await revealCorporateVolume2Modules();
  await delayMs(CORPORATE_HANDOFF.mainEnterMs);
  main?.classList.remove('is-main-entering');

  body?.classList.remove('is-handoff-active');
  queueIntroCordLayout();
  startCordFloat();
  introState.handoffRunning = false;
  document.documentElement.classList.remove('is-corporate-handoff', 'is-intro-handoff');
}

function finishCorporateVolume3HandoffContent() {
  const board = document.getElementById('intro-corporate-board');
  const vol2Nav = getCorporateNavItem(2);
  vol2Nav?.classList.remove('is-active');
  vol2Nav?.classList.add('is-complete');
  vol2Nav?.removeAttribute('aria-current');

  beginChapter3();
  introState.corporateViewVolume = 3;
  setCatalogChapter(3);
  setActiveChapter(3);
  updateCorporateVolumeCopy(3);
  renderModules();
  applyCorporateModuleGridLayout();
  activateCorporateVolumeNav(3);
  board?.classList.add('is-pop-complete');
  gridEl?.querySelectorAll('.intro-module-wrap').forEach((wrap) => {
    wrap.classList.remove('is-revealed', 'is-pop-visible');
  });
}

async function revealCorporateVolume3Modules() {
  const modules = getRuntimeModules();
  for (const mod of modules) {
    const wrap = gridEl?.querySelector(`[data-module-anchor="${mod.id}"]`);
    if (!wrap) continue;
    wrap.classList.add('is-revealed', 'is-pop-visible');
    if (!introState.moduleSoundsPlayed.has(mod.id)) {
      introState.moduleSoundsPlayed.add(mod.id);
      playModuleHoverClick({ bypassThrottle: true });
    }
    await delayMs(CORPORATE_POP.moduleStaggerMs);
  }
}

async function runCorporateVolume3Handoff() {
  if (!isCorporateSkin() || introState.handoffRunning || isChapter3HandoffDone()) return;
  introState.handoffRunning = true;
  clearModulePathHover();
  document.documentElement.classList.add('is-corporate-handoff', 'is-intro-handoff');
  stopCordFloat();
  stopIntroAuto();

  const board = document.getElementById('intro-corporate-board');
  const body = board?.querySelector('.intro-corporate-board__body');
  const main = board?.querySelector('.intro-corporate-board__main');
  const pathMap = document.getElementById('intro-path-map');
  const connectors = document.getElementById('intro-connectors');
  const vol3Nav = getCorporateNavItem(3);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finishCorporateVolume3HandoffContent();
    queueIntroCordLayout();
    startCordFloat();
    introState.handoffRunning = false;
    document.documentElement.classList.remove('is-corporate-handoff', 'is-intro-handoff');
    return;
  }

  body?.classList.add('is-handoff-active');

  connectors?.classList.add('is-volume-complete-glow');
  pathMap?.classList.add('is-cord-shine');
  await delayMs(CORPORATE_HANDOFF.cordShineMs);

  pathMap?.classList.add('is-chapter-path-slam');
  await delayMs(CORPORATE_HANDOFF.pathSlamMs);
  pathMap?.classList.remove('is-chapter-path-slam', 'is-cord-shine');
  connectors?.classList.remove('is-volume-complete-glow');

  if (vol3Nav) {
    vol3Nav.classList.add('is-nav-unlocking');
    await delayMs(CORPORATE_HANDOFF.navWiggleMs);
    vol3Nav.classList.add('is-nav-slamming');
    await delayMs(CORPORATE_HANDOFF.navSlamMs);
    activateCorporateVolumeNav(3);
    vol3Nav.classList.remove('is-nav-unlocking', 'is-nav-slamming');
  }

  main?.classList.add('is-main-exiting');
  await delayMs(CORPORATE_HANDOFF.mainExitMs);

  finishCorporateVolume3HandoffContent();
  main?.classList.remove('is-main-exiting');
  main?.classList.add('is-main-entering');
  await revealCorporateVolume3Modules();
  await delayMs(CORPORATE_HANDOFF.mainEnterMs);
  main?.classList.remove('is-main-entering');

  body?.classList.remove('is-handoff-active');
  queueIntroCordLayout();
  startCordFloat();
  introState.handoffRunning = false;
  document.documentElement.classList.remove('is-corporate-handoff', 'is-intro-handoff');
}

function bootstrapCorporateChapter2View() {
  const board = document.getElementById('intro-corporate-board');
  if (!board || !gridEl) return;
  introState.complete = true;
  viewport?.classList.add('is-chapter-2-active', 'is-chapter-settled', 'is-modules-visible');
  finishCorporateHandoffContent();
  getRuntimeModules().forEach((mod) => {
    gridEl?.querySelector(`[data-module-anchor="${mod.id}"]`)?.classList.add('is-revealed', 'is-pop-visible');
  });
  board.classList.add('is-pop-complete');
  startCordFloat();
  queueIntroCordLayout();
}

function bootstrapCorporateChapter3View() {
  const board = document.getElementById('intro-corporate-board');
  if (!board || !gridEl) return;
  introState.complete = true;
  viewport?.classList.add('is-chapter-settled', 'is-modules-visible');
  finishCorporateVolume3HandoffContent();
  getRuntimeModules().forEach((mod) => {
    gridEl?.querySelector(`[data-module-anchor="${mod.id}"]`)?.classList.add('is-revealed', 'is-pop-visible');
  });
  board.classList.add('is-pop-complete');
  applyCorporateVolumeCheatUi();
  startCordFloat();
  queueIntroCordLayout();
}

function panCameraToY(targetY, durationMs) {
  return new Promise((resolve) => {
    const startY = readCameraY();
    const start = performance.now();
    stage.classList.add('is-panning');

    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const y = startY + (targetY - startY) * easeInOutCubic(t);
      syncParallax(y);
      stage.style.transform = `translate3d(0, ${y}px, 0)`;
      if (t < 1) requestAnimationFrame(tick);
      else {
        stage.classList.remove('is-panning');
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

function revealChapter2Modules() {
  introState.chapter2SettledAt = performance.now();
  introState.moduleSoundsPlayed.clear();
  const modules = getRuntimeModules();

  viewport.classList.add('is-chapter-settled', 'is-modules-visible', 'is-chapter-2-active');
  document.documentElement.style.setProperty('--chapter-opacity', '1');
  document.documentElement.style.setProperty('--chapter-y', '0');
  document.documentElement.style.setProperty('--chapter-blur', '0');
  document.documentElement.style.setProperty('--path-map-scale', '1');

  modules.forEach((mod, i) => {
    window.setTimeout(() => {
      const wrap = gridEl?.querySelector(`[data-module-anchor="${mod.id}"]`);
      if (!wrap) return;
      wrap.classList.add('is-revealed');
      if (!introState.moduleSoundsPlayed.has(mod.id)) {
        introState.moduleSoundsPlayed.add(mod.id);
        playModuleHoverClick({ bypassThrottle: true });
      }
    }, introCfg().modulesSettleDelayMs + i * introCfg().moduleStaggerMs);
  });

  const totalMs = introCfg().modulesSettleDelayMs + modules.length * introCfg().moduleStaggerMs + 240;
  window.setTimeout(() => {
    introState.stops = null;
    startCordFloat();
    queueIntroCordLayout();
  }, totalMs);
}

async function runChapterHandoff() {
  if (introState.handoffRunning || isChapterHandoffDone()) return;
  introState.handoffRunning = true;
  clearModulePathHover();
  document.documentElement.classList.add('is-intro-handoff');
  stopCordFloat();
  stopIntroAuto();

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (chapterSection2) chapterSection2.hidden = false;
    chapterSection1?.classList.add('is-archived');
    beginChapter2();
    setActiveChapter(2);
    renderModules();
    revealChapter2Modules();
    introState.handoffRunning = false;
    document.documentElement.classList.remove('is-intro-handoff');
    return;
  }

  const ch1Map = document.getElementById('intro-path-map');
  const wraps = ch1Map?.querySelectorAll('.intro-module-wrap.is-revealed') ?? [];

  ch1Map?.classList.add('is-chapter-poofing');
  wraps.forEach((w) => w.classList.add('is-slamming'));

  await delay(140);
  poofEl?.classList.add('is-active');
  await delay(560);

  if (nextChapterBtn) {
    nextChapterBtn.hidden = false;
    requestAnimationFrame(() => nextChapterBtn.classList.add('is-visible'));
  }
  await delay(1200);

  if (chapterSection2) chapterSection2.hidden = false;
  introState.stops = null;
  const stops = measureCameraStops();
  await panCameraToY(stops.chapter2Modules, 2600);

  nextChapterBtn?.classList.remove('is-visible');
  await delay(300);
  if (nextChapterBtn) nextChapterBtn.hidden = true;

  chapterSection1?.classList.add('is-archived');
  poofEl?.classList.remove('is-active');
  ch1Map?.classList.remove('is-chapter-poofing');
  wraps.forEach((w) => w.classList.remove('is-slamming'));

  beginChapter2();
  setActiveChapter(2);
  renderModules();
  revealChapter2Modules();

  introState.handoffRunning = false;
  document.documentElement.classList.remove('is-intro-handoff');
}

function bootstrapChapter2View() {
  if (!chapterSection2 || !document.getElementById('intro-columns-c2')) return;
  introState.complete = true;
  chapterSection1?.classList.add('is-archived');
  chapterSection2.hidden = false;
  viewport.classList.add('is-chapter-2-active', 'is-chapter-settled', 'is-modules-visible');
  setActiveChapter(2);
  renderModules();
  getRuntimeModules().forEach((mod) => {
    gridEl?.querySelector(`[data-module-anchor="${mod.id}"]`)?.classList.add('is-revealed');
  });
  introState.stops = null;
  const stops = measureCameraStops();
  syncParallax(stops.chapter2Modules);
  stage.style.transform = `translate3d(0, ${stops.chapter2Modules}px, 0)`;
  startCordFloat();
  queueIntroCordLayout();
}

/** Update lock/completion UI without tearing down the grid (avoids reveal blink). */
function patchModulesFromRuntime(unlockedIds = []) {
  if (!gridEl) return;
  const unlockedSet = new Set(unlockedIds);

  for (const mod of getRuntimeModules()) {
    const wrap = gridEl.querySelector(`[data-module-anchor="${mod.id}"]`);
    const card = wrap?.querySelector('.module-card');
    if (!wrap || !card) continue;

    card.classList.toggle('locked', mod.locked);
    card.title = getChapterAriaLabel(mod).replace(/ \(locked\)$/, '');
    card.setAttribute('aria-label', getChapterAriaLabel(mod));

    syncModuleThumbLabel(card, mod);
    const thumb = card.querySelector('.module-thumb');
    if (!thumb) continue;

    let lock = thumb.querySelector('.module-padlock');
    let stars = thumb.querySelector('.module-stars');

    if (mod.locked) {
      if (!lock) {
        lock = document.createElement('div');
        lock.className = 'module-padlock';
        lock.innerHTML = PADLOCK_SVG;
        thumb.appendChild(lock);
      }
      stars?.remove();
    } else {
      lock?.remove();
      const starCount = starsForModule(mod);
      if (!stars) {
        stars = renderStars(starCount);
        thumb.appendChild(stars);
      } else {
        syncStarsElement(stars, starCount);
      }
      syncDiamondBadge(thumb, mod);
    }

    if (unlockedSet.has(mod.id)) {
      wrap.classList.add('intro-module-wrap--just-unlocked');
      window.setTimeout(() => wrap.classList.remove('intro-module-wrap--just-unlocked'), 1200);
    }

    if (getModuleLayout() === 'folder') refreshFolderChrome(card, mod);
  }
  syncNextPlayModuleGlow();
}

function renderModules() {
  if (!gridEl) return;
  gridEl.innerHTML = '';

  getRuntimeModules().forEach((mod, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'intro-module-wrap';
    wrap.dataset.moduleAnchor = mod.id;
    wrap.style.gridColumn = String(mod.column);
    wrap.style.gridRow = String(mod.row);
    wrap.style.setProperty('--reveal-index', String(index));
    applyModuleScatter(wrap, mod.id);
    if (mod.start) wrap.classList.add('intro-module-wrap--start');
    if (mod.id === 'm5' || mod.id === 'c3m5') wrap.classList.add('intro-module-wrap--hub');

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'module-card';
    card.dataset.moduleId = mod.id;
    card.title = getChapterAriaLabel(mod).replace(/ \(locked\)$/, '');
    card.setAttribute('aria-label', getChapterAriaLabel(mod));
    if (mod.locked) card.classList.add('locked');
    if (mod.start) {
      card.classList.add('module-card--start', 'is-focused');
    }

    const thumb = document.createElement('div');
    thumb.className = 'module-thumb';

    const img = document.createElement('img');
    img.className = 'module-thumb__img';
    img.src = imageUrlFor(mod);
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('load', queueIntroCordLayout, { once: true });

    const overlay = document.createElement('div');
    overlay.className = 'module-thumb__overlay';
    overlay.setAttribute('aria-hidden', 'true');

    thumb.append(img, overlay, createModuleThumbLabel(mod));

    if (mod.locked) {
      const lock = document.createElement('div');
      lock.className = 'module-padlock';
      lock.innerHTML = PADLOCK_SVG;
      thumb.appendChild(lock);
    } else {
      const starCount = starsForModule(mod);
      thumb.appendChild(renderStars(starCount));
      if (hasPerfectStars(mod)) thumb.appendChild(renderDiamondBadge());
    }

    card.append(thumb);
    applyFolderChrome(card, mod);

    card.addEventListener('click', () => {
      const runtime = moduleById(mod.id);
      if (!runtime || runtime.locked) return;
      const wrap = card.closest('.intro-module-wrap');
      const canOpen =
        getCurrentChapter() === 1
          ? revealedModuleCount(introState.progress) >= 1
          : wrap?.classList.contains('is-revealed') || !runtime.locked;
      if (!canOpen) return;
      if (runtime.id === 'm8') clearModuleStarGatePrompt();
      focusModuleCard(runtime.id);
      openModuleModal(runtime, card, {
        imageUrl: imageUrlFor(runtime),
        onProgress: (unlockedIds, moduleId, detail) => onModuleProgress(unlockedIds, moduleId, detail),
        onPlugWire: (sourceMod, outcome, sourceCardEl) =>
          animatePlugWire(sourceMod, outcome, sourceCardEl)
      });
    });

    wrap.appendChild(card);
    gridEl.appendChild(wrap);
    bindModulePathHover(wrap, mod.id);
  });

  wireModulePathHoverMap();
  if (usesIntroSidePanel()) syncPlayerProfile();

  if (isCorporateSkin()) {
    applyCorporateModuleGridLayout();
    tagCorporatePopTargets();
    wireLeaderboardScopes();
    gridEl?.querySelectorAll('.intro-module-wrap').forEach((wrap) => {
      wrap.classList.add('is-revealed');
    });
  }

  syncNextPlayModuleGlow();
  queueIntroCordLayout();
}

function delayMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Canonical player points — profile + every leaderboard scope use the same value. */
const LEADERBOARD_BASE_PTS = 2480;

function yourPlayerPoints() {
  return LEADERBOARD_BASE_PTS;
}

function formatYourPts() {
  return yourPlayerPoints().toLocaleString('en-US');
}

const PLAYER_DISPLAY_NAME = 'You';

const SKILL_FEEDBACK = {
  empathy: {
    focus:
      'Before you choose, name what the other person might be feeling—one sentence is enough to steady your next move.',
    strength: 'You stay present when lanes split; you rarely rush past a scored moment without landing it.'
  },
  ownership: {
    focus:
      'On the next module, call out one thing you will own end-to-end—even a small follow-up counts on this path.',
    strength: 'You close loops once a branch opens; check-ins and hub clears show you finish what you start.'
  },
  communication: {
    focus:
      'Draft your opener out loud before you play again—clarity at the start saves rework on the merge lanes.',
    strength: 'Orientation and straight-ahead runs read clean; you set context before the team moves.'
  }
};

const SKILL_DEFAULT_FEEDBACK = {
  focus: 'Play your first scored module to unlock coaching notes tailored to your runs.',
  strength: 'Showing up on the path counts—finish a module to see what to keep doing.'
};

/** Shown on profile skill bars whenever score > 0 but no played modules yet. */
const SKILL_ACTIVE_FALLBACK = {
  empathy: 72,
  ownership: 68,
  communication: 74
};

function resolvePlayerSkillValue(skillKey, skills, score) {
  const measured = skills[skillKey];
  if (measured != null) return measured;
  if (score > 0) return SKILL_ACTIVE_FALLBACK[skillKey] ?? 70;
  return null;
}

const LEADERBOARD_SCOPE_ORDER = { department: 0, starclub: 1, company: 2 };

const STARCLUB_PEER_NAMES = [
  'Jamie Kim',
  'Elena Voss',
  'Marcus Chen',
  'Priya Nair',
  'Jonas Lind',
  'Sofia Ruiz',
  'Alex Morgan',
  'N. Okonkwo',
  'M. Laurent',
  'R. Patel',
  'S. Nguyen',
  'L. Bergström'
];

/** Visible row slots in the leaderboard viewport (matches CSS 7.5 × --lb-row-step). */
const LB_VIEWPORT_ROWS = 7.5;

const LEADERBOARD_SCOPES = {
  department: {
    label: 'Department',
    aria: 'Department leaderboard',
    more: '287 players below',
    totalPlayers: 295,
    playersAbove: 5,
    playersBelow: 287,
    rows: [
      { rank: 2, name: 'Jamie Kim', pts: '2,920', peek: true },
      { rank: 3, name: 'Elena Voss', pts: '2,840' },
      { rank: 4, name: 'Marcus Chen', pts: '2,710' },
      { rank: 5, name: 'Priya Nair', pts: '2,590' },
      { rank: 6, name: 'You', pts: '', you: true },
      { rank: 7, name: 'Jonas Lind', pts: '2,350' },
      { rank: 8, name: 'Sofia Ruiz', pts: '2,210' },
      { rank: 9, name: 'Alex Morgan', pts: '2,095', peek: true }
    ]
  },
  company: {
    label: 'Company',
    aria: 'Company-wide leaderboard',
    more: '1,312 players below',
    totalPlayers: 1456,
    playersAbove: 140,
    playersBelow: 1312,
    rows: [
      { rank: 136, name: 'N. Okonkwo', pts: '6,240', peek: true },
      { rank: 137, name: 'M. Laurent', pts: '5,180' },
      { rank: 138, name: 'R. Patel', pts: '4,420' },
      { rank: 139, name: 'S. Nguyen', pts: '3,890' },
      { rank: 140, name: 'L. Bergström', pts: '3,210' },
      { rank: 141, name: 'You', pts: '', you: true },
      { rank: 142, name: 'K. Okafor', pts: '2,050' },
      { rank: 143, name: 'T. Mensah', pts: '1,640' },
      { rank: 144, name: 'A. Dubois', pts: '980', peek: true }
    ]
  }
};

function totalStarsCollected() {
  return getRuntimeModules().reduce((sum, mod) => {
    if (mod.locked) return sum;
    return sum + starsForModule(mod);
  }, 0);
}

function moduleSkillSample(mod) {
  if (mod.locked) return null;
  const played = mod.completed || mod.empathyScore != null;
  if (!played) return null;

  if (mod.empathyScore != null) {
    const clamped = Math.max(
      EMPATHY_SCORE_FLOOR,
      Math.min(EMPATHY_SCORE_CEIL, Math.round(mod.empathyScore))
    );
    return Math.round(
      ((clamped - EMPATHY_SCORE_FLOOR) / (EMPATHY_SCORE_CEIL - EMPATHY_SCORE_FLOOR)) * 100
    );
  }
  if (mod.completed) return 88;
  return null;
}

function aggregatePlayerSkills() {
  const buckets = { empathy: [], ownership: [], communication: [] };
  for (const mod of getRuntimeModules()) {
    const skill = MODULE_SKILL_FOCUS[mod.id];
    const sample = moduleSkillSample(mod);
    if (!skill || sample == null) continue;
    buckets[skill].push(sample);
  }

  const average = (values) =>
    values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;

  return {
    empathy: average(buckets.empathy),
    ownership: average(buckets.ownership),
    communication: average(buckets.communication)
  };
}

function feedbackForSkills(skills) {
  const entries = Object.entries(skills).filter(([, value]) => value != null);
  if (!entries.length) return SKILL_DEFAULT_FEEDBACK;

  const sorted = [...entries].sort((a, b) => a[1] - b[1]);
  const lowest = sorted[0][0];
  const highest = sorted[sorted.length - 1][0];
  return {
    focus: SKILL_FEEDBACK[lowest]?.focus ?? SKILL_DEFAULT_FEEDBACK.focus,
    strength: SKILL_FEEDBACK[highest]?.strength ?? SKILL_DEFAULT_FEEDBACK.strength
  };
}

function syncPlayerProfile() {
  const profile = document.getElementById('intro-corporate-player-profile');
  const feedback = document.getElementById('intro-corporate-feedback');
  if (!profile) return;

  const stars = totalStarsCollected();
  const score = yourPlayerPoints();
  const skills = aggregatePlayerSkills();
  const skillsActive = score > 0;
  const displaySkills = {
    empathy: resolvePlayerSkillValue('empathy', skills, score),
    ownership: resolvePlayerSkillValue('ownership', skills, score),
    communication: resolvePlayerSkillValue('communication', skills, score)
  };
  const coaching = feedbackForSkills(displaySkills);

  profile.classList.toggle('is-skills-active', skillsActive);

  const nameEl = profile.querySelector('[data-player-name]');
  if (nameEl) nameEl.textContent = PLAYER_DISPLAY_NAME;

  const scoreEl = profile.querySelector('[data-player-score]');
  if (scoreEl) scoreEl.textContent = score.toLocaleString('en-US');

  const starsEl = profile.querySelector('[data-player-stars]');
  if (starsEl) {
    starsEl.textContent = stars === 1 ? '1 ★' : `${stars} ★`;
  }

  for (const skill of ['empathy', 'ownership', 'communication']) {
    const value = displaySkills[skill];
    const skillEl = profile.querySelector(`[data-skill="${skill}"]`);
    const pctEl = profile.querySelector(`[data-skill-pct="${skill}"]`);
    const fillEl = profile.querySelector(`[data-skill-fill="${skill}"]`);
    const active = skillsActive && value != null;
    skillEl?.classList.toggle('is-active', active);
    if (pctEl) pctEl.textContent = value == null ? '—' : `${value}%`;
    if (fillEl) fillEl.style.width = value == null ? '0%' : `${value}%`;
  }

  const focusEl = feedback?.querySelector('[data-feedback-focus]');
  if (focusEl) focusEl.textContent = coaching.focus;
  const strengthEl = feedback?.querySelector('[data-feedback-strength]');
  if (strengthEl) strengthEl.textContent = coaching.strength;

  refreshLeaderboardPanel();
}

function formatLeaderboardPts(pts) {
  return Math.round(pts).toLocaleString('en-US');
}

function generateStarclubPeers(starCount, yourPts) {
  const peers = [];
  const count = 11;
  for (let i = 0; i < count; i++) {
    let n = 0;
    const key = `starclub|${starCount}|${i}`;
    for (let j = 0; j < key.length; j++) n += key.charCodeAt(j);
    const spread = (n % 701) - 350 + (i - Math.floor(count / 2)) * 32;
    peers.push({
      name: STARCLUB_PEER_NAMES[i % STARCLUB_PEER_NAMES.length],
      pts: Math.max(120, yourPts + spread)
    });
  }
  return peers;
}

function buildStarclubLeaderboard() {
  const stars = totalStarsCollected();
  const yourPts = yourPlayerPoints();
  const peers = generateStarclubPeers(stars, yourPts);
  const ranked = [...peers, { name: 'You', pts: yourPts, you: true }].sort((a, b) => b.pts - a.pts);

  const youIdx = ranked.findIndex((entry) => entry.you);
  const start = Math.max(0, youIdx - 3);
  const end = Math.min(ranked.length, youIdx + 4);
  const window = ranked.slice(start, end);

  const rows = window.map((entry, i) => ({
    rank: start + i + 1,
    name: entry.name,
    pts: formatLeaderboardPts(entry.pts),
    you: entry.you,
    peek: (i === 0 && start > 0) || (i === window.length - 1 && end < ranked.length)
  }));

  const clubSize = 18 + stars * 7;
  const starLabel = stars === 1 ? '1 star' : `${stars} stars`;

  const youRank = youIdx + 1;
  const playersAbove = youRank - 1;
  const playersBelow = Math.max(0, clubSize - youRank);

  return {
    label: `Star club · ${starLabel}`,
    aria: `Star club — players with ${starLabel} collected`,
    more: `${clubSize} players at ${stars} stars`,
    totalPlayers: clubSize,
    playersAbove,
    playersBelow,
    youRank,
    rows
  };
}

function applyYourPtsToRows(rows) {
  const pts = formatYourPts();
  return rows.map((row) => (row.you ? { ...row, pts } : row));
}

function leaderboardScopeData(scope) {
  if (scope === 'starclub') return buildStarclubLeaderboard();
  const data = LEADERBOARD_SCOPES[scope];
  if (!data) return null;
  return { ...data, rows: applyYourPtsToRows(data.rows) };
}

function buildLeaderboardRow(entry, staggerIndex) {
  const li = document.createElement('li');
  li.className = 'intro-corporate-leaderboard__row';
  if (entry.peek) {
    li.classList.add('intro-corporate-leaderboard__row--peek');
    li.setAttribute('aria-hidden', 'true');
  }
  if (entry.you) {
    li.classList.add('intro-corporate-leaderboard__row--you');
    li.removeAttribute('aria-hidden');
  }
  li.style.setProperty('--lb-stagger', String(staggerIndex));
  const ptsClass = entry.ptsTone
    ? ` intro-corporate-leaderboard__pts--${entry.ptsTone}`
    : '';
  li.innerHTML = `
    <span class="intro-corporate-leaderboard__rank">${entry.rank}</span>
    <span class="intro-corporate-leaderboard__name">${entry.name}</span>
    <span class="intro-corporate-leaderboard__pts${ptsClass}">${entry.pts}</span>
  `;
  return li;
}

function renderLeaderboardRows(listEl, scope) {
  const data = leaderboardScopeData(scope);
  if (!listEl || !data) return;
  listEl.replaceChildren(...data.rows.map((row, index) => buildLeaderboardRow(row, index)));
}

/**
 * Pin the visible window: top when very short, centered peek when surrounded, bottom when near list end.
 * @param {{ rows: object[], playersAbove?: number, playersBelow?: number, totalPlayers?: number }} data
 */
function resolveLeaderboardAlign(data) {
  const rows = data?.rows ?? [];
  const rowCount = rows.length;
  if (rowCount <= 3) return 'top';

  const youIdx = rows.findIndex((row) => row.you);
  const above = data.playersAbove ?? 0;
  const below = data.playersBelow ?? 0;

  if (rowCount >= LB_VIEWPORT_ROWS - 0.25 && above > 1 && below > 1) {
    return 'center';
  }

  if (rowCount < LB_VIEWPORT_ROWS) {
    const nearListBottom = below <= Math.max(2, Math.ceil(LB_VIEWPORT_ROWS / 2));
    const youLowInWindow = youIdx >= 0 && youIdx >= rowCount - 2;
    if (nearListBottom || (youLowInWindow && below <= above)) return 'bottom';
    if (above <= 1 || youIdx <= 1) return 'top';
  }

  return 'center';
}

function applyLeaderboardListAlign(panel, scope) {
  const listEl = panel?.querySelector('.intro-corporate-leaderboard__list');
  const data = leaderboardScopeData(scope);
  if (!listEl || !data) return;

  const align = resolveLeaderboardAlign(data);
  const rowCount = data.rows.length;
  let marginTop = 'calc(var(--lb-row-step) * -0.5)';

  if (align === 'top') {
    marginTop = '0px';
  } else if (align === 'bottom' && rowCount < LB_VIEWPORT_ROWS) {
    const slack = LB_VIEWPORT_ROWS - rowCount;
    marginTop = `calc(var(--lb-row-step) * ${slack})`;
  }

  listEl.style.setProperty('--lb-list-margin-top', marginTop);
  listEl.dataset.lbAlign = align;
}

function refreshLeaderboardPanel() {
  const panel = document.getElementById('intro-corporate-leaderboard');
  const scope = panel?.dataset.leaderboardScope || 'department';
  const listEl = panel?.querySelector('.intro-corporate-leaderboard__list');
  if (!panel || !listEl || !LEADERBOARD_SCOPE_ORDER[scope]) return;
  renderLeaderboardRows(listEl, scope);
  applyLeaderboardScopeMeta(panel, scope);
  applyLeaderboardListAlign(panel, scope);
}

function applyLeaderboardScopeMeta(panel, scope) {
  const copy = leaderboardScopeData(scope);
  if (!panel || !copy) return;
  const labelEl = panel.querySelector('[data-leaderboard-scope-label]');
  const moreEl = panel.querySelector('[data-leaderboard-more]');
  panel.dataset.leaderboardScope = scope;
  panel.setAttribute('aria-label', copy.aria);
  if (labelEl) labelEl.textContent = copy.label;
  if (moreEl) moreEl.textContent = copy.more;
}

async function setLeaderboardScope(panel, scope, { animate = true } = {}) {
  const listEl = panel?.querySelector('.intro-corporate-leaderboard__list');
  const viewportEl = panel?.querySelector('.intro-corporate-leaderboard__viewport');
  const scopes = document.querySelector('.intro-corporate-leaderboard-scopes');
  if (!panel || !listEl) return;

  const current = panel.dataset.leaderboardScope || 'department';
  if (current === scope || panel.dataset.leaderboardAnimating === '1') return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const goingDown =
    (LEADERBOARD_SCOPE_ORDER[scope] ?? 0) > (LEADERBOARD_SCOPE_ORDER[current] ?? 0);

  panel.dataset.leaderboardAnimating = '1';
  scopes?.querySelectorAll('[data-scope]').forEach((b) => {
    b.disabled = true;
  });

  if (animate && !reduced) {
    listEl.classList.remove('is-escalator-enter-down', 'is-escalator-enter-up');
    listEl.classList.add(goingDown ? 'is-escalator-exit-down' : 'is-escalator-exit-up');
    await delayMs(goingDown ? 500 : 400);
    listEl.classList.remove('is-escalator-exit-down', 'is-escalator-exit-up');
  }

  renderLeaderboardRows(listEl, scope);
  applyLeaderboardScopeMeta(panel, scope);
  applyLeaderboardListAlign(panel, scope);

  if (animate && !reduced) {
    listEl.classList.add(goingDown ? 'is-escalator-enter-down' : 'is-escalator-enter-up');
    viewportEl?.classList.toggle('is-escalator-landing', goingDown);
    await delayMs(goingDown ? 680 : 560);
    listEl.classList.remove('is-escalator-enter-down', 'is-escalator-enter-up');
    viewportEl?.classList.remove('is-escalator-landing');
  }

  delete panel.dataset.leaderboardAnimating;
  scopes?.querySelectorAll('[data-scope]').forEach((b) => {
    b.disabled = false;
  });
}

function wireLeaderboardScopes() {
  const panel = document.getElementById('intro-corporate-leaderboard');
  const scopes = document.querySelector('.intro-corporate-leaderboard-scopes');
  if (!panel || !scopes || scopes.dataset.wired === '1') return;
  scopes.dataset.wired = '1';

  if (!panel.dataset.leaderboardScope) {
    panel.dataset.leaderboardScope = 'department';
  }

  scopes.querySelectorAll('[data-scope]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const scope = btn.dataset.scope;
      if (!scope || !LEADERBOARD_SCOPE_ORDER[scope]) return;

      scopes.querySelectorAll('[data-scope]').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      void setLeaderboardScope(panel, scope);
    });
  });
}

function tagCorporatePopTargets() {
  const board = document.getElementById('intro-corporate-board');
  if (!board) return;
  if (isCorporateSkin()) {
    board.querySelector('.intro-corporate-nav')?.classList.add('intro-corporate-pop-target');
    board.querySelector('.intro-corporate-board__copy')?.classList.add('intro-corporate-pop-target');
    gridEl?.querySelectorAll('.intro-module-wrap').forEach((wrap) => {
      wrap.classList.add('intro-corporate-pop-target');
    });
  }
  board.querySelector('.intro-corporate-player-profile')?.classList.add('intro-corporate-pop-target');
  board.querySelector('.intro-corporate-feedback')?.classList.add('intro-corporate-pop-target');
  board.querySelector('.intro-corporate-leaderboard-panel')?.classList.add('intro-corporate-pop-target');
  board.querySelector('.intro-corporate-activity')?.classList.add('intro-corporate-pop-target');
}

function resetCorporatePop() {
  const board = document.getElementById('intro-corporate-board');
  if (!board) return;
  board.classList.remove('is-pop-complete');
  board.classList.add('is-pop-pending');
  board.querySelectorAll('.intro-corporate-pop-target').forEach((el) => {
    el.classList.remove('is-pop-visible');
  });
  gridEl?.querySelectorAll('.intro-module-wrap').forEach((wrap) => {
    wrap.classList.remove('is-pop-visible');
    wrap.classList.add('is-revealed');
  });
  viewport?.classList.remove('is-modules-visible');
  stopCordFloat();
}

/** Show all corporate board UI (chapters, leaderboard, activity) without waiting on pop animation. */
function revealCorporateBoard() {
  const board = document.getElementById('intro-corporate-board');
  if (!board) return;

  tagCorporatePopTargets();
  board.classList.remove('is-pop-pending');
  board.classList.add('is-pop-complete');
  board.querySelectorAll('.intro-corporate-pop-target').forEach((el) => {
    el.classList.add('is-pop-visible');
  });
  gridEl?.querySelectorAll('.intro-module-wrap').forEach((wrap) => {
    wrap.classList.add('is-revealed', 'is-pop-visible');
  });
  viewport?.classList.add('is-modules-visible', 'is-chapter-settled', 'is-corporate-board');
  introState.complete = true;
  introState.chapterSettledAt = introState.chapterSettledAt ?? performance.now();
  introState.progress = 1;
  applyCorporateModuleGridLayout();
  syncPlayerProfile();
  wireSecretChapterTrigger();
  startCordFloat();
  queueIntroCordLayout();
  requestAnimationFrame(() => requestAnimationFrame(syncIntroSideColumnLayout));
}

function finishCorporatePop() {
  revealCorporateBoard();
}

async function popCorporateTarget(el, runId) {
  if (!el || runId !== corporatePopRun) return;
  el.classList.add('is-pop-visible');
  await delayMs(CORPORATE_POP.stepMs);
}

async function runCorporatePopSequence() {
  if (!isCorporateSkin()) return;

  const board = document.getElementById('intro-corporate-board');
  if (!board) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || board.classList.contains('is-pop-complete')) {
    revealCorporateBoard();
    return;
  }

  const runId = ++corporatePopRun;
  stopIntroAuto();

  stage.style.transform = 'none';
  syncParallax(0);
  document.documentElement.classList.remove('is-intro-scrubbing');
  viewport?.classList.remove('is-hero-visible', 'is-camera-moving');

  resetCorporatePop();
  tagCorporatePopTargets();

  const nav = board.querySelector('.intro-corporate-nav');
  const copy = board.querySelector('.intro-corporate-board__copy');
  const leaderboard = board.querySelector('.intro-corporate-leaderboard-panel');
  const moduleWraps = [...(gridEl?.querySelectorAll('.intro-module-wrap') ?? [])];

  await popCorporateTarget(nav, runId);
  if (runId !== corporatePopRun) return;

  await popCorporateTarget(copy, runId);
  if (runId !== corporatePopRun) return;

  for (const wrap of moduleWraps) {
    if (runId !== corporatePopRun) return;
    wrap.classList.add('is-pop-visible', 'is-revealed');
    await delayMs(CORPORATE_POP.moduleStaggerMs);
  }

  const profile = board.querySelector('.intro-corporate-player-profile');
  const feedbackCard = board.querySelector('.intro-corporate-feedback');
  await popCorporateTarget(profile, runId);
  if (runId !== corporatePopRun) return;

  await popCorporateTarget(feedbackCard, runId);
  if (runId !== corporatePopRun) return;

  await popCorporateTarget(leaderboard, runId);
  if (runId !== corporatePopRun) return;

  const activity = board.querySelector('.intro-corporate-activity');
  await popCorporateTarget(activity, runId);
  if (runId !== corporatePopRun) return;

  finishCorporatePop();
}

function moduleById(id) {
  return getRuntimeModules().find((m) => m.id === id);
}

function isCordEdgeVisible(fromId, toId) {
  if (isCorporateSkin()) return true;

  const from = moduleById(fromId);
  if (!from || from.locked) return false;

  const key = edgeKey(fromId, toId);
  if (introState.pluggingEdge === key) return true;
  if (isEdgeFilled(key)) return true;

  const to = moduleById(toId);
  return Boolean(to && !to.locked);
}

function parseEdgeKey(key) {
  const [fromId, toId] = key.split('|');
  return { fromId, toId };
}

function moduleAnchorRect(moduleId) {
  const wrap = pathMapEl?.querySelector(`[data-module-anchor="${moduleId}"]`);
  const card = wrap?.querySelector('.module-card');
  const rect = (card ?? wrap)?.getBoundingClientRect();
  if (!rect?.width) return null;
  return rect;
}

function refreshCordSegmentEndpoints(seg) {
  if (!seg || !pathMapEl) return;
  const { fromId, toId } = parseEdgeKey(seg.key);
  const mapRect = pathMapEl.getBoundingClientRect();
  const anchorOpts = cordAnchorsForKey(seg.key);
  const fromRect = moduleAnchorRect(fromId);
  const toRect = moduleAnchorRect(toId);
  if (!fromRect || !toRect) return;
  seg.p0 = anchorFromRect(fromRect, anchorOpts.from, mapRect, anchorOpts.fromAlong ?? 0.5);
  seg.p3 = anchorFromRect(toRect, anchorOpts.to, mapRect, anchorOpts.toAlong ?? 0.5);
  seg.fromSide = anchorOpts.from;
  seg.toSide = anchorOpts.to;
  seg.anchorOpts = anchorOpts;
}

function reorderSubwayCordGroups() {
  if (!connectorsEl || !isCorporateSkin()) return;
  for (const seg of cordRopeSegments) {
    const group = connectorsEl.querySelector(`.intro-cord[data-edge="${seg.key}"]`);
    if (group) connectorsEl.appendChild(group);
  }
}

function refreshSubwayCordGeometry() {
  for (const seg of cordRopeSegments) refreshCordSegmentEndpoints(seg);
  applySubwayLaneBundles(cordRopeSegments);
  applySubwayMidXLanes(cordRopeSegments);
  sortSubwayCordPaintOrder(cordRopeSegments);
  reorderSubwayCordGroups();
}

function findCordSegment(edgeKeyStr) {
  return cordRopeSegments.find((s) => s.key === edgeKeyStr);
}

function stopPlugAnimation() {
  if (introState.plugRaf) cancelAnimationFrame(introState.plugRaf);
  introState.plugRaf = 0;
}

/** Wire draws from source to a still-locked target; on connect, unlock + persist filled edge. */
function clearPlugState() {
  introState.pluggingEdge = null;
  introState.plugActive = false;
  syncPlugActiveClass();
}

function completeModulePlay(sourceMod, outcome, sourceCard, targetId) {
  const runtimeBefore = getRuntimeModule(sourceMod.id) ?? sourceMod;
  const playMode = playModeBeforeOutcome(sourceMod.id);
  const { newlyUnlocked, starGateBlocked } = applyPlayOutcome(sourceMod.id, outcome);
  recordPlayActivity(runtimeBefore, outcome, newlyUnlocked, { playMode });
  patchModulesFromRuntime(newlyUnlocked);
  highlightUnlockedModules(newlyUnlocked);
  onModuleProgress(newlyUnlocked, sourceMod.id, { starGateBlocked });

  if (starGateBlocked) {
    sourceCard?.classList.remove('is-plug-source');
    focusModuleCard(sourceMod.id);
    return;
  }

  if (targetId) focusModuleCard(targetId);
  sourceCard?.classList.remove('is-plug-source');
}

function animatePlugWire(sourceMod, outcome, sourceCard) {
  const edgeKeyStr = outcome.fills?.[0];
  const targetId = outcome.unlocks?.[0];
  if (!edgeKeyStr || !targetId) return;

  const { toId } = parseEdgeKey(edgeKeyStr);
  const targetWrap = pathMapEl?.querySelector(`[data-module-anchor="${toId || targetId}"]`);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  stopIntroAuto();

  if (wouldBlockStarGateUnlock(sourceMod.id, outcome)) {
    sourceCard?.classList.remove('is-plug-source');
    targetWrap?.classList.remove('is-plug-target');
    clearPlugState();
    completeModulePlay(sourceMod, outcome, sourceCard, targetId);
    queueIntroCordLayout();
    return;
  }

  introState.plugActive = true;
  syncPlugActiveClass();

  focusModuleCard(sourceMod.id);
  sourceCard?.classList.add('is-plug-source');
  targetWrap?.classList.add('is-plug-target');

  introState.pluggingEdge = edgeKeyStr;

  let landed = false;
  const finish = () => {
    if (landed) return;
    landed = true;
    stopPlugAnimation();
    clearTimeout(safetyTimer);

    targetWrap?.classList.remove('is-plug-target');
    hideCordTooltip();

    completeModulePlay(sourceMod, outcome, sourceCard, targetId);

    clearPlugState();
    queueIntroCordLayout();
  };

  const runPlugAnimation = () => {
    const seg = findCordSegment(edgeKeyStr);
    if (!seg || reduced) {
      finish();
      return;
    }

    refreshSubwayCordGeometry();
    seg.plugSettle = 0;
    applyCordRopePaths(cordFloatPhase);

    const group = connectorsEl?.querySelector(`[data-edge="${edgeKeyStr}"]`);
    group?.classList.add('is-plugging');

    const body = seg.paths.find((p) => p.classList.contains('intro-cord-rope--active'));
    const sheen = seg.paths.find((p) => p.classList.contains('intro-cord-rope--sheen'));
    const shadow = seg.paths.find((p) => p.classList.contains('intro-cord-rope--shadow'));
    const guide = body ?? seg.centerlinePath;
    if (!guide) {
      finish();
      return;
    }

    const NS = 'http://www.w3.org/2000/svg';
    const plugHead = document.createElementNS(NS, 'circle');
    plugHead.setAttribute('class', 'intro-cord-plug-head');
    plugHead.setAttribute('r', seg.isSubway ? '5' : '6');
    group?.appendChild(plugHead);

    if (seg.knotStart) {
      seg.knotStart.setAttribute('cx', String(seg.p0.x));
      seg.knotStart.setAttribute('cy', String(seg.p0.y));
      seg.knotStart.style.opacity = '1';
    }
    if (seg.knotEnd) seg.knotEnd.style.opacity = '0';

    const len = guide.getTotalLength() || 1;
    const dashLayers = [body, sheen, shadow].filter(Boolean);
    for (const path of dashLayers) {
      path.style.strokeDasharray = String(len);
      path.style.strokeDashoffset = String(len);
    }

    const duration = 920;
    const start = performance.now();
    const label = cordChoiceLabel(outcome);
    let plugTooltipShown = false;

    const plugPointAt = (eased) => guide.getPointAtLength(Math.min(len, len * eased));

    const landWire = () => {
      refreshSubwayCordGeometry();
      seg.plugSettle = 0.35;
      applyCordRopePaths(cordFloatPhase);
      const endLen = guide.getTotalLength() || len;
      for (const path of dashLayers) {
        path.style.strokeDasharray = String(endLen);
        path.style.strokeDashoffset = '0';
      }
      plugHead.remove();
      group?.classList.remove('is-plugging');
      group?.classList.add('is-filled');
      if (seg.knotEnd) {
        seg.knotEnd.setAttribute('cx', String(seg.p3.x));
        seg.knotEnd.setAttribute('cy', String(seg.p3.y));
        seg.knotEnd.style.opacity = '1';
        seg.knotEnd.classList.add('is-plug-landed');
      }
      animateCordPlugSettle(seg, finish);
    };

    const tick = (now) => {
      if (landed) return;

      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);

      const offset = len * (1 - eased);
      for (const path of dashLayers) path.style.strokeDashoffset = String(offset);

      const pt = plugPointAt(eased);
      plugHead.setAttribute('cx', String(pt.x));
      plugHead.setAttribute('cy', String(pt.y));

      if (label) {
        if (!plugTooltipShown) {
          plugTooltipShown = true;
          showCordTooltip(label, pt.x, pt.y);
        } else if (cordTooltipEl?.classList.contains('is-visible')) {
          updateCordTooltipPosition(pt.x, pt.y);
        }
      }

      if (t > 0.62) {
        seg.plugSettle = ((t - 0.62) / 0.38) * 0.55;
        refreshSubwayCordGeometry();
        applyCordRopePaths(cordFloatPhase);
      } else {
        applyCordRopePaths(cordFloatPhase);
      }

      if (t < 1) {
        introState.plugRaf = requestAnimationFrame(tick);
      } else {
        landWire();
      }
    };

    introState.plugRaf = requestAnimationFrame(tick);
  };

  const safetyTimer = window.setTimeout(finish, 1600);

  measureIntroCords({ onReady: runPlugAnimation });
}

const cordRopeSegments = [];
let cordFloatRaf = 0;
let cordFloatPhase = 0;
let cordTooltipEl = null;
let cordTooltipHideTimer = 0;
let modulePathHoverId = null;
let modulePathHoverIncomingKey = null;
let modulePathHoverRouteId = null;
let modulePathHoverClearTimer = 0;
const pathHoverTooltips = new Map();

const CORD_TOOLTIP_HIDE_MS = 400;

function cordChoiceLabel(outcome) {
  return outcome?.lastChoice || outcome?.label || '';
}

function ensureCordTooltip() {
  if (!pathMapEl) return null;
  if (!cordTooltipEl) {
    cordTooltipEl = document.createElement('div');
    cordTooltipEl.className = 'intro-cord-tooltip';
    cordTooltipEl.setAttribute('role', 'tooltip');
    pathMapEl.appendChild(cordTooltipEl);
  }
  return cordTooltipEl;
}

function updateCordTooltipPosition(x, y) {
  if (!cordTooltipEl) return;
  cordTooltipEl.style.left = `${x}px`;
  cordTooltipEl.style.top = `${y}px`;
}

function hideCordTooltip() {
  clearTimeout(cordTooltipHideTimer);
  cordTooltipHideTimer = 0;
  if (!cordTooltipEl) return;
  cordTooltipEl.classList.remove('is-visible');
  window.setTimeout(() => {
    if (cordTooltipEl && !cordTooltipEl.classList.contains('is-visible')) {
      cordTooltipEl.hidden = true;
    }
  }, 200);
}

/** Incoming cords to a module (top → bottom on the target card edge). */
function getIncomingEdgesTo(moduleId) {
  const anchors = getChapterCordAnchors();
  const list = [];
  for (const [fromId, toId] of getChapterEdges()) {
    if (toId !== moduleId) continue;
    if (!isCordEdgeVisible(fromId, toId)) continue;
    const key = edgeKey(fromId, toId);
    const anchor = anchors[key] ?? {};
    list.push({
      key,
      fromId,
      toAlong: anchor.toAlong ?? 0.5
    });
  }
  list.sort((a, b) => a.toAlong - b.toAlong);
  return list;
}

function pickIncomingEdgeByPointer(wrap, incoming, clientY) {
  if (!incoming.length) return null;
  if (incoming.length === 1) return incoming[0].key;
  const card = wrap.querySelector('.module-card') ?? wrap;
  const rect = card.getBoundingClientRect();
  if (rect.height < 1) return incoming[0].key;
  const t = Math.max(0, Math.min(0.999, (clientY - rect.top) / rect.height));
  const idx = Math.min(incoming.length - 1, Math.floor(t * incoming.length));
  return incoming[idx].key;
}

/** @param {HTMLElement} wrap @param {{ id: string, along?: number }[]} variants @param {number} clientY */
function pickRouteVariantByPointer(wrap, variants, clientY) {
  if (!variants.length) return null;
  const card = wrap.querySelector('.module-card') ?? wrap;
  const rect = card.getBoundingClientRect();
  if (rect.height < 1) return variants[0].id;
  const t = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  let best = variants[0];
  let bestDist = Infinity;
  for (const variant of variants) {
    const along = variant.along ?? 0.5;
    const dist = Math.abs(along - t);
    if (dist < bestDist) {
      bestDist = dist;
      best = variant;
    }
  }
  return best.id;
}

/** Filled upstream path for one incoming branch into `moduleId`. */
function getFilledEdgesForIncoming(incomingKey) {
  const [fromId] = incomingKey.split('|');
  const keys = new Set();
  if (isEdgeFilled(incomingKey)) keys.add(incomingKey);
  for (const k of getFilledEdgesLeadingTo(fromId)) keys.add(k);
  return keys;
}

/** Filled edge keys on the path the player actually took into `moduleId`. */
function getFilledEdgesLeadingTo(moduleId) {
  const keys = new Set();
  const byTarget = new Map();

  for (const key of getFilledEdgeKeys()) {
    const [from, to] = key.split('|');
    if (!from || !to) continue;
    if (!byTarget.has(to)) byTarget.set(to, []);
    byTarget.get(to).push({ from, key });
  }

  const queue = [moduleId];
  const seen = new Set([moduleId]);
  while (queue.length) {
    const to = queue.shift();
    for (const { from, key } of byTarget.get(to) ?? []) {
      keys.add(key);
      if (!seen.has(from)) {
        seen.add(from);
        queue.push(from);
      }
    }
  }
  return keys;
}

/** All visible upstream edges into `moduleId` (corporate path preview on hover). */
function getStructuralEdgesLeadingTo(moduleId) {
  const keys = new Set();
  const byTarget = new Map();

  for (const [fromId, toId] of getChapterEdges()) {
    if (!isCordEdgeVisible(fromId, toId)) continue;
    const key = edgeKey(fromId, toId);
    if (!byTarget.has(toId)) byTarget.set(toId, []);
    byTarget.get(toId).push({ from: fromId, key });
  }

  const queue = [moduleId];
  const seen = new Set([moduleId]);
  while (queue.length) {
    const to = queue.shift();
    for (const { from, key } of byTarget.get(to) ?? []) {
      keys.add(key);
      if (!seen.has(from)) {
        seen.add(from);
        queue.push(from);
      }
    }
  }
  return keys;
}

function pathHoverModuleSets(edgeKeys, focusModuleId) {
  const onPath = new Set();
  const fromIds = new Set();
  if (focusModuleId) onPath.add(focusModuleId);
  for (const key of edgeKeys) {
    const [from, to] = key.split('|');
    if (from) {
      fromIds.add(from);
      onPath.add(from);
    }
    if (to) onPath.add(to);
  }
  return { onPath, fromIds };
}

function moduleIdsFromEdgeKeys(edgeKeys, focusModuleId) {
  return pathHoverModuleSets(edgeKeys, focusModuleId).onPath;
}

function syncPathHoverModuleClasses(displayKeys, focusModuleId) {
  if (!pathMapEl) return;
  const edgeKeys = displayKeys instanceof Set ? displayKeys : new Set(displayKeys);
  const { onPath, fromIds } = pathHoverModuleSets(edgeKeys, focusModuleId);

  pathMapEl.querySelectorAll('.intro-module-wrap[data-module-anchor]').forEach((wrap) => {
    const id = wrap.dataset.moduleAnchor;
    wrap.classList.toggle('is-path-hover-from', fromIds.has(id));
    wrap.classList.toggle('is-path-hover-dim', !onPath.has(id));
  });
}

function clearPathHoverModuleClasses() {
  pathMapEl?.querySelectorAll('.intro-module-wrap').forEach((wrap) => {
    wrap.classList.remove('is-path-hover-from', 'is-path-hover-dim', 'is-path-hover-focus');
  });
}

function ensurePathHoverTooltipLayer() {
  if (!pathMapEl) return null;
  let layer = pathMapEl.querySelector('.intro-path-hover-tooltips');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'intro-path-hover-tooltips';
    layer.setAttribute('aria-hidden', 'true');
    pathMapEl.appendChild(layer);
  }
  return layer;
}

function hidePathHoverTooltips() {
  for (const el of pathHoverTooltips.values()) {
    el.classList.remove('is-visible');
    el.hidden = true;
  }
}

function cordMidpointForTooltip(seg) {
  const body =
    seg.centerlinePath ?? seg.paths?.find((p) => p.classList.contains('intro-cord-rope--active'));
  if (!body) return null;
  const len = body.getTotalLength();
  if (!len) return null;
  return body.getPointAtLength(len * 0.42);
}

function showPathHoverTooltipsForEdges(edgeKeys) {
  const layer = ensurePathHoverTooltipLayer();
  if (!layer) return;
  hideCordTooltip();

  const activeKeys = new Set();
  for (const seg of cordRopeSegments) {
    if (!edgeKeys.has(seg.key)) continue;
    const label = getEdgeChoiceLabel(seg.key);
    if (!label) continue;

    const pt = cordMidpointForTooltip(seg);
    if (!pt) continue;

    activeKeys.add(seg.key);
    let el = pathHoverTooltips.get(seg.key);
    if (!el) {
      el = document.createElement('div');
      el.className = 'intro-cord-tooltip intro-cord-tooltip--path-hover';
      el.setAttribute('role', 'tooltip');
      layer.appendChild(el);
      pathHoverTooltips.set(seg.key, el);
    }
    el.textContent = label;
    el.style.left = `${pt.x}px`;
    el.style.top = `${pt.y}px`;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('is-visible'));
  }

  for (const [key, el] of pathHoverTooltips) {
    if (activeKeys.has(key)) continue;
    el.classList.remove('is-visible');
    el.hidden = true;
  }
}

function clearModulePathHover() {
  clearTimeout(modulePathHoverClearTimer);
  modulePathHoverClearTimer = 0;
  modulePathHoverId = null;
  modulePathHoverIncomingKey = null;
  modulePathHoverRouteId = null;
  pathMapEl?.classList.remove('is-module-path-hover');
  pathMapEl?.removeAttribute('data-path-hover-module');
  pathMapEl?.removeAttribute('data-path-hover-edge');
  pathMapEl?.removeAttribute('data-path-hover-route');
  connectorsEl?.querySelectorAll('.intro-cord.is-path-highlight').forEach((cord) => {
    cord.classList.remove('is-path-highlight', 'is-path-highlight--played');
  });
  clearPathHoverModuleClasses();
  hidePathHoverTooltips();
}

function setModulePathHover(
  moduleId,
  { incomingEdgeKey = null, routeVariantId = null, clientY = null } = {}
) {
  if (!moduleId || introState.plugActive || introState.pluggingEdge || introState.handoffRunning) {
    clearModulePathHover();
    return;
  }

  const mod = moduleById(moduleId);
  if (!mod) {
    clearModulePathHover();
    return;
  }
  if (mod.locked && !isCorporateSkin()) {
    clearModulePathHover();
    return;
  }

  clearTimeout(modulePathHoverClearTimer);
  modulePathHoverClearTimer = 0;

  const wrap = pathMapEl?.querySelector(`[data-module-anchor="${moduleId}"]`);
  const incoming = getIncomingEdgesTo(moduleId);
  const routeVariants = getPathRouteVariants(moduleId);
  const multiIngress = incoming.length > 1;
  const multiRoute = Boolean(routeVariants?.length > 1);

  let selectedKey = incomingEdgeKey;
  if (multiIngress && !selectedKey && wrap && clientY != null) {
    selectedKey = pickIncomingEdgeByPointer(wrap, incoming, clientY);
  }
  if (multiIngress && !selectedKey && wrap) {
    selectedKey = pickIncomingEdgeByPointer(wrap, incoming, wrap.getBoundingClientRect().top + 1);
  }

  let selectedRouteId = routeVariantId;
  if (multiRoute && !selectedRouteId && wrap && clientY != null) {
    selectedRouteId = pickRouteVariantByPointer(wrap, routeVariants, clientY);
  }
  if (multiRoute && !selectedRouteId) {
    selectedRouteId = routeVariants[0].id;
  }

  if (
    modulePathHoverId === moduleId &&
    modulePathHoverIncomingKey === (multiIngress ? selectedKey : null) &&
    modulePathHoverRouteId === (multiRoute ? selectedRouteId : null)
  ) {
    return;
  }

  if (isCorporateSkin() || isSpaceSkin()) playModuleHoverClick();

  modulePathHoverId = moduleId;
  modulePathHoverIncomingKey = multiIngress ? selectedKey : null;
  modulePathHoverRouteId = multiRoute ? selectedRouteId : null;

  let filledKeys = new Set();
  let displayKeys = new Set();

  if (multiIngress && selectedKey) {
    filledKeys = getFilledEdgesForIncoming(selectedKey);
    displayKeys = new Set(filledKeys);
    if (isCorporateSkin()) {
      for (const key of getStructuralEdgesLeadingTo(moduleId)) displayKeys.add(key);
      displayKeys.add(selectedKey);
    }
  } else if (multiRoute && selectedRouteId) {
    const variant = routeVariants.find((v) => v.id === selectedRouteId) ?? routeVariants[0];
    for (const key of variant.edges) displayKeys.add(key);
    for (const key of variant.edges) {
      if (isEdgeFilled(key)) filledKeys.add(key);
    }
  } else {
    filledKeys = getFilledEdgesLeadingTo(moduleId);
    displayKeys = new Set(filledKeys);
    if (isCorporateSkin()) {
      for (const key of getStructuralEdgesLeadingTo(moduleId)) displayKeys.add(key);
    }
  }

  pathMapEl?.classList.add('is-module-path-hover');
  pathMapEl?.setAttribute('data-path-hover-module', moduleId);
  if (selectedKey) pathMapEl?.setAttribute('data-path-hover-edge', selectedKey);
  else pathMapEl?.removeAttribute('data-path-hover-edge');
  if (selectedRouteId) pathMapEl?.setAttribute('data-path-hover-route', selectedRouteId);
  else pathMapEl?.removeAttribute('data-path-hover-route');

  connectorsEl?.querySelectorAll('.intro-cord').forEach((cord) => {
    const key = cord.dataset.edge;
    const onPath = displayKeys.has(key);
    const filled = cord.classList.contains('is-filled');
    let highlight = false;
    if (isCorporateSkin()) {
      highlight = onPath;
    } else if (multiIngress && selectedKey) {
      highlight = key === selectedKey || (onPath && filled);
    } else if (multiRoute) {
      highlight = onPath;
    } else {
      highlight = onPath && filled;
    }
    cord.classList.toggle('is-path-highlight', highlight);
    cord.classList.toggle('is-path-highlight--played', highlight && filled);
  });

  syncPathHoverModuleClasses(moduleIdsFromEdgeKeys(displayKeys, moduleId));

  const tooltipKeys = new Set(filledKeys);
  if (multiIngress && selectedKey) tooltipKeys.add(selectedKey);
  showPathHoverTooltipsForEdges(tooltipKeys);
}

function scheduleClearModulePathHover() {
  clearTimeout(modulePathHoverClearTimer);
  modulePathHoverClearTimer = window.setTimeout(() => {
    modulePathHoverClearTimer = 0;
    clearModulePathHover();
  }, 40);
}

function bindModulePathHover(wrap, moduleId) {
  const incoming = getIncomingEdgesTo(moduleId);
  const routeVariants = getPathRouteVariants(moduleId);
  const multiIngress = incoming.length > 1;
  const multiRoute = Boolean(routeVariants?.length > 1);

  const onPointer = (e) => {
    if (multiIngress || multiRoute) {
      setModulePathHover(moduleId, { clientY: e.clientY });
    } else {
      setModulePathHover(moduleId);
    }
  };
  const onLeave = (e) => {
    const related = e.relatedTarget;
    if (related && (wrap.contains(related) || pathMapEl?.contains(related))) return;
    scheduleClearModulePathHover();
  };

  wrap.addEventListener('mouseenter', onPointer);
  wrap.addEventListener('mousemove', onPointer);
  wrap.addEventListener('mouseleave', onLeave);
  wrap.addEventListener('focusin', onPointer);
  wrap.addEventListener('focusout', onLeave);
}

function wireModulePathHoverMap() {
  if (!pathMapEl || pathMapEl.dataset.pathHoverWired) return;
  pathMapEl.dataset.pathHoverWired = '1';

  pathMapEl.addEventListener('mouseleave', (e) => {
    const related = e.relatedTarget;
    if (related?.closest?.('.intro-module-wrap')) return;
    scheduleClearModulePathHover();
  });
}

function showCordTooltip(text, x, y, { persist = false } = {}) {
  const el = ensureCordTooltip();
  if (!el || !text) return;
  clearTimeout(cordTooltipHideTimer);
  el.textContent = text;
  updateCordTooltipPosition(x, y);
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('is-visible'));
  if (!persist) {
    cordTooltipHideTimer = window.setTimeout(hideCordTooltip, CORD_TOOLTIP_HIDE_MS);
  }
}

let cordDragSeg = null;

function pointerOnCordPath(pathEl, clientX, clientY) {
  const ctm = pathEl.getScreenCTM();
  if (!ctm) return null;
  const pt = connectorsEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const local = pt.matrixTransform(ctm.inverse());
  const len = pathEl.getTotalLength();
  let bestT = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= 28; i++) {
    const t = (i / 28) * len;
    const p = pathEl.getPointAtLength(t);
    const d = (p.x - local.x) ** 2 + (p.y - local.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestT = t;
    }
  }
  return pathEl.getPointAtLength(bestT);
}

function bindCordHitTooltip(seg) {
  if (!seg.hitPath) return;
  const label = getEdgeChoiceLabel(seg.key);
  const body = () =>
    seg.centerlinePath ?? seg.paths.find((p) => p.classList.contains('intro-cord-rope--active'));
  const showAtPoint = (pt) => {
    if (label) showCordTooltip(label, pt.x, pt.y, { persist: true });
  };

  const onCordPointerMove = (e) => {
    const active = body();
    if (!active) return;
    const pt = pointerOnCordPath(active, e.clientX, e.clientY);
    if (!pt) return;

    if (cordDragSeg === seg && seg.stretch) {
      const mid = active.getPointAtLength(active.getTotalLength() * 0.42);
      seg.stretch.tx = pt.x;
      seg.stretch.ty = pt.y;
      seg.stretch.tAmt = Math.min(1, Math.hypot(pt.x - mid.x, pt.y - mid.y) / 52);
      applyCordRopePaths(cordFloatPhase);
    }

    showAtPoint(pt);
  };

  seg.hitPath.addEventListener('pointerenter', onCordPointerMove);
  seg.hitPath.addEventListener('pointermove', onCordPointerMove);

  seg.hitPath.addEventListener('pointerdown', (e) => {
    if (introState.plugActive || introState.pluggingEdge) return;
    const active = body();
    if (!active) return;
    cordDragSeg = seg;
    seg.stretch ??= { x: 0, y: 0, amt: 0, tx: 0, ty: 0, tAmt: 0 };
    const pt = pointerOnCordPath(active, e.clientX, e.clientY);
    if (pt) {
      seg.stretch.tx = pt.x;
      seg.stretch.ty = pt.y;
      seg.stretch.tAmt = 0.32;
    }
    seg.hitPath.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  const endCordDrag = (e) => {
    if (cordDragSeg !== seg) return;
    if (seg.stretch) {
      seg.stretch.tAmt = 0;
      seg.stretch.tx = seg.stretch.x;
      seg.stretch.ty = seg.stretch.y;
    }
    cordDragSeg = null;
    try {
      seg.hitPath.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    hideCordTooltip();
    if (!introState.plugActive && !introState.pluggingEdge) startCordFloat();
  };

  seg.hitPath.addEventListener('pointerup', endCordDrag);
  seg.hitPath.addEventListener('pointercancel', endCordDrag);
  seg.hitPath.addEventListener('pointerleave', () => {
    if (cordDragSeg === seg) return;
    if (modulePathHoverId) return;
    hideCordTooltip();
  });
}

function ensureCordDefs() {
  if (connectorsEl.querySelector('#intro-cord-defs')) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.id = 'intro-cord-defs';
  defs.innerHTML = `
    <filter id="intro-cord-rope-blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.8" />
    </filter>
  `;
  connectorsEl.appendChild(defs);
}

function ropePathOptions(seg, phase) {
  const stretch = seg.stretch;
  const stretchPull =
    stretch && stretch.amt > 0.001 ? { x: stretch.x, y: stretch.y, amt: stretch.amt } : null;

  return {
    ...seg.anchorOpts,
    phase,
    phaseOffset: seg.phaseOffset,
    sagOffset: seg.sagOffset,
    breezePhase: phase * 0.88 + (seg.breezeSeed ?? 0),
    plugSettle: seg.plugSettle ?? 0,
    stretchPull,
    reveal: seg.bridgeReveal ?? 1
  };
}

function ropePathD(seg, phase) {
  if (seg.isSubway) {
    return subwayCordPathD(seg.p0, seg.fromSide, seg.p3, seg.toSide, seg.anchorOpts);
  }
  const opts = ropePathOptions(seg, phase);
  return cordPathD(seg.p0, seg.fromSide, seg.p3, seg.toSide, opts);
}

function ropeCenterlinePathD(seg, phase) {
  if (seg.isSubway) {
    return subwayCordPathD(seg.p0, seg.fromSide, seg.p3, seg.toSide, seg.anchorOpts);
  }
  return cordPathD(seg.p0, seg.fromSide, seg.p3, seg.toSide, ropePathOptions(seg, phase));
}

function updateCordStretchPhysics() {
  for (const seg of cordRopeSegments) {
    if (!seg.stretch) continue;
    const s = seg.stretch;
    s.x += (s.tx - s.x) * 0.24;
    s.y += (s.ty - s.y) * 0.24;
    s.amt += (s.tAmt - s.amt) * 0.2;
    if (s.tAmt < 0.001 && s.amt < 0.001) {
      s.x *= 0.82;
      s.y *= 0.82;
    }
  }
}

function applyCordRopePaths(phase = cordFloatPhase) {
  updateCordStretchPhysics();
  for (const seg of cordRopeSegments) {
    if (seg.isSubway) {
      const d = ropePathD(seg, phase);
      for (const path of seg.paths) path.setAttribute('d', d);
      if (seg.centerlinePath) seg.centerlinePath.setAttribute('d', d);
      if (seg.hitPath) seg.hitPath.setAttribute('d', d);
      continue;
    }
    const d = ropePathD(seg, phase);
    for (const path of seg.paths) path.setAttribute('d', d);
    if (seg.centerlinePath) seg.centerlinePath.setAttribute('d', ropeCenterlinePathD(seg, phase));
    if (seg.hitPath) {
      seg.hitPath.setAttribute('d', d);
    }
    if (seg.knotStart) {
      seg.knotStart.setAttribute('cx', String(seg.p0.x));
      seg.knotStart.setAttribute('cy', String(seg.p0.y));
    }
    if (seg.knotEnd) {
      seg.knotEnd.setAttribute('cx', String(seg.p3.x));
      seg.knotEnd.setAttribute('cy', String(seg.p3.y));
    }
  }
}

function stopCordFloat() {
  if (cordFloatRaf) cancelAnimationFrame(cordFloatRaf);
  cordFloatRaf = 0;
}

function animateCordPlugSettle(seg, onDone) {
  const from = seg.plugSettle ?? 0;
  const start = performance.now();
  const duration = 540;

  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    seg.plugSettle = from + (1 - from) * easeOutBack(t);
    applyCordRopePaths(cordFloatPhase);
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      seg.plugSettle = 1;
      applyCordRopePaths(cordFloatPhase);
      onDone?.();
    }
  };

  requestAnimationFrame(tick);
}

function startCordFloat() {
  if (cordFloatRaf) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (revealedModuleCount(introState.progress) < 1) return;
  if (cordRopeSegments.some((s) => s.isSubway)) return;

  const tick = (now) => {
    if (!cordRopeSegments.length) {
      stopCordFloat();
      return;
    }
    cordFloatPhase = now * 0.00068;
    applyCordRopePaths(cordFloatPhase);
    cordFloatRaf = requestAnimationFrame(tick);
  };
  cordFloatRaf = requestAnimationFrame(tick);
}

function measureIntroCords({ onReady } = {}) {
  if (!pathMapEl || !connectorsEl || !gridEl) {
    onReady?.();
    return;
  }

  if (introState.pluggingEdge && !onReady) return;

  stopCordFloat();
  cordRopeSegments.length = 0;

  const mapRect = pathMapEl.getBoundingClientRect();

  for (const [fromId, toId] of getChapterEdges()) {
    if (!isCordEdgeVisible(fromId, toId)) continue;

    const fromWrap = pathMapEl.querySelector(`[data-module-anchor="${fromId}"]`);
    const toWrap = pathMapEl.querySelector(`[data-module-anchor="${toId}"]`);
    if (!fromWrap || !toWrap) continue;

    const key = edgeKey(fromId, toId);
    const anchorOpts = cordAnchorsForKey(key);
    const fromRect = moduleAnchorRect(fromId);
    const toRect = moduleAnchorRect(toId);
    if (!fromRect || !toRect) continue;
    const p0 = anchorFromRect(fromRect, anchorOpts.from, mapRect, anchorOpts.fromAlong ?? 0.5);
    const p3 = anchorFromRect(toRect, anchorOpts.to, mapRect, anchorOpts.toAlong ?? 0.5);

    const filled = isEdgeFilled(key);
    const isSubway = isCorporateSkin();
    cordRopeSegments.push({
      key,
      p0,
      p3,
      fromSide: anchorOpts.from,
      toSide: anchorOpts.to,
      anchorOpts,
      isSubway,
      phaseOffset: cordPhaseOffset(key),
      sagOffset: cordPhaseOffset(`${key}-sag`),
      breezeSeed: cordPhaseOffset(`${key}-breeze`),
      plugSettle: filled ? 1 : 0,
      stretch: null,
      paths: [],
      centerlinePath: null,
      hitPath: null,
      knotStart: null,
      knotEnd: null
    });
  }

  applySubwayLaneBundles(cordRopeSegments);
  applySubwayMidXLanes(cordRopeSegments);
  sortSubwayCordPaintOrder(cordRopeSegments);

  const w = Math.max(pathMapEl.offsetWidth, mapRect.width);
  const h = Math.max(pathMapEl.offsetHeight, mapRect.height);

  connectorsEl.setAttribute('width', String(w));
  connectorsEl.setAttribute('height', String(h));
  connectorsEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
  connectorsEl.innerHTML = '';

  const NS = 'http://www.w3.org/2000/svg';
  const useSubway = isCorporateSkin();
  connectorsEl.classList.toggle('intro-connectors--subway', useSubway);
  ensureCordDefs();

  for (const seg of cordRopeSegments) {
    const filled = isEdgeFilled(seg.key);
    const group = document.createElementNS(NS, 'g');
    group.classList.add('intro-cord');
    if (seg.isSubway) group.classList.add('intro-cord--subway');
    if (filled) group.classList.add('is-filled');
    if (introState.pluggingEdge === seg.key) group.classList.add('is-plugging');
    group.dataset.edge = seg.key;

    const layers = [
      { className: 'intro-cord-rope--shadow', filled: false },
      { className: 'intro-cord-rope--body', filled: true },
      { className: 'intro-cord-rope--sheen', filled: false }
    ];

    for (const layer of layers) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', `intro-cord-rope ${layer.className}`);
      path.setAttribute('fill', 'none');
      if (layer.filled) path.classList.add('intro-cord-rope--active');
      group.appendChild(path);
      seg.paths.push(path);
    }

    if (!seg.isSubway) {
      const knotStart = document.createElementNS(NS, 'circle');
      knotStart.setAttribute('class', 'intro-cord-knot');
      knotStart.setAttribute('r', '3.5');
      const knotEnd = knotStart.cloneNode();
      group.append(knotStart, knotEnd);
      seg.knotStart = knotStart;
      seg.knotEnd = knotEnd;
    }

    if (filled) {
      const hit = document.createElementNS(NS, 'path');
      hit.setAttribute('class', 'intro-cord-hit');
      hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', seg.isSubway ? '32' : '26');
      hit.setAttribute('stroke-linecap', 'round');
      hit.setAttribute('stroke-linejoin', 'round');
      group.appendChild(hit);
      seg.hitPath = hit;
      bindCordHitTooltip(seg);
    }

    connectorsEl.appendChild(group);
  }

  reorderSubwayCordGroups();
  applyCordRopePaths(0);

  requestAnimationFrame(() => {
    for (const seg of cordRopeSegments) {
      const body = seg.paths.find((p) => p.classList.contains('intro-cord-rope--active'));
      if (!body) continue;

      const len = body.getTotalLength();
      const filled = isEdgeFilled(seg.key);
      if (seg.isSubway && !filled) {
        body.style.strokeDasharray = 'none';
        body.style.strokeDashoffset = '0';
      } else {
        body.style.strokeDasharray = String(len);
        body.style.strokeDashoffset = filled ? '0' : String(len);
      }

      const sheen = seg.paths.find((p) => p.classList.contains('intro-cord-rope--sheen'));
      const shadow = seg.paths.find((p) => p.classList.contains('intro-cord-rope--shadow'));
      for (const path of [sheen, shadow]) {
        if (!path) continue;
        const isSubwayGlass =
          seg.isSubway && (path === shadow || (!filled && path === sheen));
        if (isSubwayGlass) {
          path.style.strokeDasharray = 'none';
          path.style.strokeDashoffset = '0';
          continue;
        }
        path.style.strokeDasharray = String(len);
        path.style.strokeDashoffset = filled ? '0' : String(len);
      }
    }
    if (!introState.pluggingEdge) startCordFloat();
    if (modulePathHoverId) {
      setModulePathHover(modulePathHoverId, {
        incomingEdgeKey: modulePathHoverIncomingKey ?? undefined,
        routeVariantId: modulePathHoverRouteId ?? undefined
      });
    }
    onReady?.();
  });
}

let cordLayoutRaf = 0;
function queueIntroCordLayout() {
  if (introState.pluggingEdge || introState.plugActive) return;
  if (cordLayoutRaf) cancelAnimationFrame(cordLayoutRaf);
  cordLayoutRaf = requestAnimationFrame(() => {
    cordLayoutRaf = 0;
    if (introState.pluggingEdge || introState.plugActive) return;
    if (isCorporateSkin() && !introState.complete) return;
    if (isCorporateSkin()) applyCorporateModuleGridLayout();
    measureIntroCords();
    if (
      !introState.autoDriving &&
      introState.progress >= introCfg().dollyEnd &&
      !shouldFreezeModuleReveal()
    ) {
      introState.stops = null;
      applyIntroProgress(introState.progress, { immediate: true });
    }
  });
}

function buildStarLayer(container, count, sizeRange) {
  for (let i = 0; i < count; i++) {
    const star = document.createElement('span');
    const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
    star.className = `intro-star${Math.random() > 0.82 ? ' intro-star--bright' : ' intro-star--dim'}`;
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.setProperty('--pulse-dur', `${3 + Math.random() * 5}s`);
    star.style.setProperty('--pulse-delay', `${Math.random() * 4}s`);
    star.style.setProperty('--pulse-min', `${0.25 + Math.random() * 0.25}`);
    star.style.setProperty('--pulse-max', `${0.7 + Math.random() * 0.3}`);
    container.appendChild(star);
  }
}

function buildStarfield() {
  buildStarLayer(document.getElementById('stars-far'), 120, [0.5, 1.2]);
  buildStarLayer(document.getElementById('stars-mid'), 90, [1, 1.8]);
  buildStarLayer(document.getElementById('stars-near'), 45, [1.5, 2.8]);
}

function readCameraY() {
  return (
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--camera-y')) || 0
  );
}

/** Pan the stage so `el`'s top edge sits at `anchorRatio` of the viewport height. */
function cameraYToAlignElement(el, anchorRatio) {
  const vpH = viewport.clientHeight;
  const elTop = el.getBoundingClientRect().top;
  const targetTop = vpH * anchorRatio;
  return readCameraY() + (targetTop - elTop);
}

/** Pan so `el` is vertically centered at `anchorRatio` (0.5 = viewport middle). */
function cameraYToAlignElementCenter(el, anchorRatio) {
  const vpH = viewport.clientHeight;
  const rect = el.getBoundingClientRect();
  const elCenter = rect.top + rect.height / 2;
  const targetCenter = vpH * anchorRatio;
  return readCameraY() + (targetCenter - elCenter);
}

function syncParallax(yPx) {
  const root = document.documentElement.style;
  root.setProperty('--camera-y', `${yPx}px`);
  root.setProperty('--sky-base-y', `${yPx * SKY_PARALLAX.base}px`);
  root.setProperty('--sky-glow-y', `${yPx * SKY_PARALLAX.glow}px`);
  root.setProperty('--sky-dust-y', `${yPx * SKY_PARALLAX.dust}px`);
  root.setProperty('--sky-stars-far-y', `${yPx * SKY_PARALLAX.starsFar}px`);
  root.setProperty('--sky-stars-mid-y', `${yPx * SKY_PARALLAX.starsMid}px`);
  root.setProperty('--sky-stars-near-y', `${yPx * SKY_PARALLAX.starsNear}px`);
}

function measureCameraStops() {
  stage.classList.remove('is-panning');
  syncParallax(0);
  stage.style.transform = 'translate3d(0, 0, 0)';

  const peekAnchor = 0.52;
  const settledAnchor = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--chapter-anchor')
  ) || 0.15;
  const modulesAnchor = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--modules-anchor')
  ) || 0.5;
  const modulesTarget = gridEl ?? pathMapEl;

  const ch2Title = chapterSection2?.querySelector('.intro-chapter');
  const ch2Map = document.getElementById('intro-path-map-c2');
  const chapterAnchorEl = isCorporateSkin()
    ? document.querySelector('.intro-corporate-board__title')
    : chapterEl;

  return {
    home: 0,
    chapterSettled: chapterAnchorEl
      ? cameraYToAlignElement(chapterAnchorEl, settledAnchor)
      : 0,
    chapterMid: chapterAnchorEl ? cameraYToAlignElement(chapterAnchorEl, peekAnchor) : 0,
    modulesSettled: modulesTarget
      ? cameraYToAlignElementCenter(modulesTarget, modulesAnchor)
      : chapterAnchorEl
        ? cameraYToAlignElement(chapterAnchorEl, settledAnchor)
        : 0,
    chapter2Title: ch2Title ? cameraYToAlignElement(ch2Title, settledAnchor) : 0,
    chapter2Modules: ch2Map
      ? cameraYToAlignElementCenter(ch2Map, modulesAnchor)
      : 0
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function easeOutBack(t) {
  const c1 = 1.525;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function progressFromElapsed(ms) {
  let acc = 0;
  let prevEnd = 0;
  for (const phase of introCfg().phases) {
    if (ms <= acc + phase.durationMs) {
      if (phase.hold) return prevEnd;
      const local = (ms - acc) / phase.durationMs;
      return prevEnd + local * (phase.progressEnd - prevEnd);
    }
    acc += phase.durationMs;
    prevEnd = phase.progressEnd;
  }
  return 1;
}

function moduleRevealProgress(index) {
  return (
    introCfg().dollyEnd +
    introCfg().moduleHoldProgress +
    index * introCfg().moduleStaggerProgress
  );
}

function revealedModuleCount(p) {
  if (getCurrentChapter() === 2 && introState.chapter2SettledAt) {
    const modules = getRuntimeModules();
    const elapsed = performance.now() - introState.chapter2SettledAt;
    let count = 0;
    for (let i = 0; i < modules.length; i++) {
      if (elapsed >= introCfg().modulesSettleDelayMs + i * introCfg().moduleStaggerMs) count = i + 1;
      else break;
    }
    return count;
  }

  const modules = getRuntimeModules();
  const elapsed = introState.chapterSettledAt
    ? performance.now() - introState.chapterSettledAt
    : 0;

  let count = 0;
  for (let i = 0; i < modules.length; i++) {
    const byTime =
      introState.chapterSettledAt &&
      elapsed >= introCfg().modulesSettleDelayMs + i * introCfg().moduleStaggerMs;
    const byScroll = p >= moduleRevealProgress(i);
    if (byTime || byScroll) count = i + 1;
    else break;
  }
  return count;
}

/** Frame-by-frame scenic values tied to scroll progress (parallax). */
function applyScenicStyles(p) {
  const style = document.documentElement.style;
  const cfg = introCfg();
  const heroT = clamp01(p / cfg.heroEnd);
  const heroE = easeOutCubic(heroT);
  const dollyT = clamp01((p - cfg.dollyStart) / (cfg.dollyEnd - cfg.dollyStart));
  const dollyE = easeInOutCubic(dollyT);

  const chapT = clamp01((p - cfg.chapterRevealStart) / (cfg.chapterRevealEnd - cfg.chapterRevealStart));
  const chapE = easeOutCubic(chapT);

  if (isCorporateSkin()) {
    style.setProperty('--wf-opacity', '0');
    style.setProperty('--wf-scale', '1');
    style.setProperty('--wf-y', '0');
    style.setProperty('--wf-blur', '0');
    style.setProperty('--chapter-opacity', '0');
    style.setProperty('--corporate-hero-opacity', chapE.toFixed(4));
    style.setProperty('--corporate-hero-y', lerp(28, 0, chapE).toFixed(2));
    style.setProperty('--corporate-hero-blur', lerp(8, 0, chapE).toFixed(2));
  } else {
    let wfOpacity;
    let wfScale;
    let wfY;
    let wfBlur;
    if (p <= cfg.heroEnd) {
      wfOpacity = lerp(0, 1, heroE);
      wfScale = lerp(0.96, 1, heroE);
      wfY = lerp(40, 0, heroE);
      wfBlur = lerp(8, 0, heroE);
    } else {
      wfOpacity = lerp(1, 0.08, dollyE);
      wfScale = lerp(1, 0.84, dollyE);
      wfY = lerp(0, -64, dollyE);
      wfBlur = lerp(0, 8, dollyE);
    }
    style.setProperty('--wf-opacity', wfOpacity.toFixed(4));
    style.setProperty('--wf-scale', wfScale.toFixed(4));
    style.setProperty('--wf-y', wfY.toFixed(2));
    style.setProperty('--wf-blur', wfBlur.toFixed(2));
    style.setProperty('--chapter-opacity', chapE.toFixed(4));
    style.setProperty('--chapter-y', (lerp(40, 0, chapE) + lerp(0, -16, dollyE)).toFixed(2));
    style.setProperty('--chapter-blur', lerp(10, 0, chapE).toFixed(2));
    style.setProperty('--corporate-hero-opacity', '0');
  }

  const revealed = revealedModuleCount(p);
  const moduleTotal = getRuntimeModules().length;
  const pathScale =
    revealed > 0 ? lerp(0.94, 1, clamp01(revealed / Math.max(1, moduleTotal))) : 0.94;
  style.setProperty('--path-map-scale', pathScale.toFixed(4));
}

function updateModuleReveal(p) {
  if (shouldFreezeModuleReveal()) {
    return gridEl?.querySelectorAll('.intro-module-wrap.is-revealed').length ?? revealedModuleCount(p);
  }

  const modules = getRuntimeModules();
  const count = revealedModuleCount(p);

  modules.forEach((mod, i) => {
    const wrap = gridEl?.querySelector(`[data-module-anchor="${mod.id}"]`);
    if (!wrap) return;

    const shouldShow = i < count;
    const wasShown = wrap.classList.contains('is-revealed');
    wrap.classList.toggle('is-revealed', shouldShow);

    if (shouldShow && !wasShown && !introState.moduleSoundsPlayed.has(mod.id)) {
      introState.moduleSoundsPlayed.add(mod.id);
      playModuleHoverClick({ bypassThrottle: true });
    }
    if (!shouldShow) introState.moduleSoundsPlayed.delete(mod.id);
  });

  return count;
}

function getIntroStops() {
  if (!introState.stops) introState.stops = measureCameraStops();
  return introState.stops;
}

function applyIntroProgress(raw, { immediate = false } = {}) {
  if (isCorporateSkin()) return;
  const p = Math.max(0, Math.min(1, raw));
  introState.progress = p;
  const stops = getIntroStops();
  const root = document.documentElement;

  root.classList.toggle('is-intro-scrubbing', immediate);

  if (p >= introCfg().dollyEnd && !introState.chapterSettledAt) {
    introState.chapterSettledAt = performance.now();
  }
  if (p < introCfg().dollyEnd) {
    introState.chapterSettledAt = null;
    introState.moduleSoundsPlayed.clear();
  }

  const cfg = introCfg();
  let cameraY = stops.home;
  if (cfg.modulesCameraStart < 1 && p >= cfg.modulesCameraStart) {
    const span = 1 - cfg.modulesCameraStart;
    const t = span > 0 ? Math.min(1, (p - cfg.modulesCameraStart) / span) : 1;
    cameraY =
      stops.chapterSettled +
      (stops.modulesSettled - stops.chapterSettled) * easeInOutCubic(t);
  } else if (p >= cfg.dollyEnd) {
    cameraY = stops.chapterSettled;
  } else if (p >= cfg.dollyStart) {
    const span = cfg.dollyEnd - cfg.dollyStart;
    const t = span > 0 ? Math.min(1, (p - cfg.dollyStart) / span) : 1;
    cameraY = stops.home + (stops.chapterSettled - stops.home) * easeInOutCubic(t);
  }

  stage.classList.remove('is-panning');
  root.classList.remove('is-camera-panning');
  syncParallax(cameraY);
  stage.style.transform = `translate3d(0, ${cameraY}px, 0)`;

  applyScenicStyles(p);
  const revealedCount = updateModuleReveal(p);

  viewport.classList.toggle('is-hero-visible', p > 0);
  viewport.classList.toggle(
    'is-camera-moving',
    p >= introCfg().dollyStart && p < introCfg().dollyEnd
  );
  viewport.classList.toggle('is-chapter-settled', p >= introCfg().dollyEnd);
  viewport.classList.toggle('is-modules-visible', revealedCount > 0);

  if (revealedCount > 0) {
    startCordFloat();
    queueIntroCordLayout();
  } else {
    stopCordFloat();
  }

  updateSpaceSidePanelReveal(p);

  if (p >= 1 && !introState.complete) finishIntro();
}

function finishIntro() {
  if (introState.complete) return;
  introState.complete = true;
  stopIntroAuto();
  introState.chapterSettledAt = introState.chapterSettledAt ?? performance.now();
  const modules = getRuntimeModules();
  modules.forEach((mod) => {
    gridEl?.querySelector(`[data-module-anchor="${mod.id}"]`)?.classList.add('is-revealed');
  });
  applyIntroProgress(1, { immediate: true });
  if (isSpaceSkin()) revealSpaceSidePanel();
  document.documentElement.classList.remove('is-intro-scrubbing');
}

function stopIntroAuto() {
  introState.autoDriving = false;
  if (introState.autoRaf) cancelAnimationFrame(introState.autoRaf);
  introState.autoRaf = 0;
}

function introAutoTick(now) {
  if (!introState.autoDriving || introState.complete) return;
  const elapsed = now - introState.autoStartMs;
  const p = progressFromElapsed(elapsed);
  applyIntroProgress(p, { immediate: true });
  if (p < 1) introState.autoRaf = requestAnimationFrame(introAutoTick);
}

function startIntroAuto() {
  stopIntroAuto();
  introState.autoDriving = true;
  introState.autoStartMs = performance.now();
  introState.autoRaf = requestAnimationFrame(introAutoTick);
}

function onIntroWheel(e) {
  if (isCorporateSkin() || introState.complete || isModuleModalOpen()) return;
  e.preventDefault();

  if (introState.autoDriving) stopIntroAuto();

  const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 140);
  applyIntroProgress(introState.progress + delta * introCfg().wheelStep, { immediate: true });
}

function resetSpaceSidePanel() {
  const board = document.getElementById('intro-corporate-board');
  if (!board || !isSpaceSkin()) return;
  board.classList.add('is-pop-pending');
  board.classList.remove('is-side-panel-visible', 'is-pop-complete');
  board.querySelectorAll('.intro-corporate-pop-target:not(.intro-module-wrap)').forEach((el) => {
    el.classList.remove('is-pop-visible');
  });
}

function revealSpaceSidePanel() {
  const board = document.getElementById('intro-corporate-board');
  if (!board || !isSpaceSkin()) return;
  tagCorporatePopTargets();
  board.classList.remove('is-pop-pending');
  board.classList.add('is-side-panel-visible', 'is-pop-complete');
  board.querySelectorAll('.intro-corporate-pop-target:not(.intro-module-wrap)').forEach((el) => {
    el.classList.add('is-pop-visible');
  });
  syncPlayerProfile();
  requestAnimationFrame(() => requestAnimationFrame(syncIntroSideColumnLayout));
}

function updateSpaceSidePanelReveal(p) {
  if (!isSpaceSkin()) return;
  const board = document.getElementById('intro-corporate-board');
  if (!board) return;
  if (p < introCfg().dollyEnd) {
    resetSpaceSidePanel();
    return;
  }
  if (!board.classList.contains('is-side-panel-visible')) revealSpaceSidePanel();
}

function syncCorporateIntroClass() {
  document.documentElement.classList.toggle('is-corporate-intro', isCorporateSkin());
  if (!usesIntroSidePanel()) return;
  wireLeaderboardScopes();
  initIntroActivityLog();
  syncPlayerProfile();
  if (isCorporateSkin()) {
    patchModulesFromRuntime();
    wireSecretChapterTrigger();
  } else {
    setCatalogChapter(null);
  }
  wireCorporateVolumeNav();
  wireCorporateVolumeDrag();
  applyCorporateVolumeCheatUi();
  if (isSpaceSkin()) {
    resetSpaceSidePanel();
    tagCorporatePopTargets();
  }
}

function runIntroSequence() {
  syncCorporateIntroClass();

  if (isCorporateSkin()) {
    introState.stops = null;
    introState.complete = false;
    requestAnimationFrame(() => runCorporatePopSequence());
    return;
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  introState.stops = null;
  introState.stops = measureCameraStops();

  if (reduced) {
    introState.chapterSettledAt = performance.now();
    finishIntro();
    return;
  }

  applyIntroProgress(0, { immediate: true });
  startIntroAuto();
}

function initIntroScrollControl() {
  viewport.addEventListener('wheel', onIntroWheel, { passive: false });
}

initTheme();

buildStarfield();
initModuleModal();
wireModulePathHoverMap();
renderModules();
if (usesIntroSidePanel()) syncPlayerProfile();
syncCorporateIntroClass();
initAmbientMusicSync();
initAmbientPlayback();

window.addEventListener('wf-theme-change', () => {
  syncCorporateIntroClass();
  introState.stops = null;
  renderModules();

  if (isCorporateSkin()) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || introState.complete) {
      revealCorporateBoard();
    } else {
      introState.complete = false;
      runCorporatePopSequence();
    }
    return;
  }

  corporatePopRun += 1;
  resetCorporatePop();
  viewport?.classList.remove('is-corporate-board');

  if (isSpaceSkin()) {
    resetSpaceSidePanel();
    tagCorporatePopTargets();
    if (introState.complete || introState.progress >= introCfg().dollyEnd) {
      revealSpaceSidePanel();
    }
  }

  if (!introState.complete) {
    applyIntroProgress(introState.progress, { immediate: true });
  } else {
    queueIntroCordLayout();
  }
});

window.addEventListener('wf-module-layout-change', () => {
  renderModules();
  queueIntroCordLayout();
});

window.addEventListener('wf-corporate-volumes-cheat', () => {
  applyCorporateVolumeCheatUi();
});

window.addEventListener('wf-sync-next-play-glow', () => {
  syncNextPlayModuleGlow();
});

window.addEventListener('wf-progress-change', (event) => {
  if (event.detail?.reset) {
    if (getCurrentChapter() >= 2 || isChapterHandoffDone()) {
      window.location.reload();
      return;
    }
    introState.corporateViewVolume = 1;
    setCatalogChapter(null);
    setActiveChapter(1);
    if (usesIntroSidePanel()) applyCorporateVolumeCheatUi();
    renderModules();
    if (isCorporateSkin()) revealCorporateBoard();
    else queueIntroCordLayout();
    return;
  }
  if (event.detail?.unlockAll) {
    const unlocked = getRuntimeModules().filter((m) => !m.locked).map((m) => m.id);
    if (usesIntroSidePanel()) {
      setCorporateVolumeCheatMode('all');
      applyCorporateVolumeCheatUi();
      if (isCorporateSkin() && getCurrentChapter() === 1) revealCorporateBoard();
    }
    patchModulesFromRuntime(unlocked);
    syncPlayerProfile();
    queueIntroCordLayout();
    return;
  }
  patchModulesFromRuntime(event.detail?.newlyUnlocked ?? []);
  refreshLeaderboardPanel();
  syncPlayerProfile();
  if (usesIntroSidePanel()) applyCorporateVolumeCheatUi();
  queueIntroCordLayout();
});

window.addEventListener('resize', () => {
  introState.stops = null;
  if (isCorporateSkin()) {
    queueIntroCordLayout();
    return;
  }
  if (!introState.complete) {
    applyIntroProgress(introState.progress, { immediate: true });
  }
  queueIntroCordLayout();
});

if (pathMapEl && typeof ResizeObserver !== 'undefined') {
  const cordObserver = new ResizeObserver(() => queueIntroCordLayout());
  cordObserver.observe(pathMapEl);
  gridEl?.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', queueIntroCordLayout, { once: true });
  });
}

initIntroScrollControl();

if (getCurrentChapter() === 3 && isChapter3HandoffDone()) {
  if (isCorporateSkin()) bootstrapCorporateChapter3View();
} else if (getCurrentChapter() === 2 && isChapterHandoffDone()) {
  if (isCorporateSkin()) bootstrapCorporateChapter2View();
  else bootstrapChapter2View();
} else {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      runIntroSequence();
    });
  });
}

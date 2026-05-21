import { initIntroActivityLog, recordPlayActivity } from './intro-activity-log.js';
import { initAmbientMusicSync, initAmbientPlayback } from './ambient-music.js';
import {
  anchorFromRect,
  applySubwayLaneBundles,
  cordPathD,
  cordPhaseOffset,
  edgeKey,
  subwayCordPathD
} from './cord-paths.js';
import { hasPerfectStars, starsForModule } from './empathy-score.js';
import { CHAPTER_1_END_MODULE_ID, getChapterAriaLabel } from './consequence-flow.js';
import {
  applyPlayOutcome,
  beginChapter2,
  getChapterCordAnchors,
  getChapterEdges,
  getCurrentChapter,
  getEdgeChoiceLabel,
  getRuntimeModule,
  getRuntimeModules,
  isChapter1Complete,
  isChapterHandoffDone,
  isEdgeFilled
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
  c2m3: { x: 8, y: 6, r: -1.8, z: 0 }
};

function isCorporateSkin() {
  return document.documentElement.dataset.skin === 'corporate';
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
  modulesCameraStart: 0.92,
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
    { progressEnd: 0.92, durationMs: 6 * 180 + 120 },
    { progressEnd: 1, durationMs: 800 }
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
  chapter2SettledAt: null
};

let corporatePopRun = 0;

const CORPORATE_POP = {
  stepMs: 420,
  moduleStaggerMs: 140
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
  if (chapter === 2) {
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

function highlightUnlockedModules(moduleIds) {
  for (const id of moduleIds) {
    const wrap = pathMapEl?.querySelector(`[data-module-anchor="${id}"]`);
    wrap?.classList.add('intro-module-wrap--just-unlocked');
    window.setTimeout(() => wrap?.classList.remove('intro-module-wrap--just-unlocked'), 1200);
  }
  const focusId = moduleIds[0];
  if (focusId) focusModuleCard(focusId);
}

function onModuleProgress(unlockedIds, moduleId) {
  if (!introState.plugActive) {
    patchModulesFromRuntime(unlockedIds);
    queueIntroCordLayout();
  }
  highlightUnlockedModules(unlockedIds);
  startCordFloat();
  maybeStartChapterHandoff(moduleId);
}

function maybeStartChapterHandoff(moduleId) {
  if (!chapterSection2) return;
  if (moduleId !== CHAPTER_1_END_MODULE_ID) return;
  if (!isChapter1Complete() || isChapterHandoffDone() || introState.handoffRunning) return;
  window.setTimeout(() => runChapterHandoff(), 480);
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
    if (mod.id === 'm5') wrap.classList.add('intro-module-wrap--hub');

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
      focusModuleCard(runtime.id);
      openModuleModal(runtime, card, {
        imageUrl: imageUrlFor(runtime),
        onProgress: (unlockedIds, moduleId) => onModuleProgress(unlockedIds, moduleId),
        onPlugWire: (sourceMod, outcome, sourceCardEl) =>
          animatePlugWire(sourceMod, outcome, sourceCardEl)
      });
    });

    wrap.appendChild(card);
    gridEl.appendChild(wrap);
  });

  if (isCorporateSkin()) {
    applyCorporateModuleGridLayout();
    tagCorporatePopTargets();
    wireLeaderboardScopes();
    gridEl?.querySelectorAll('.intro-module-wrap').forEach((wrap) => {
      wrap.classList.add('is-revealed');
    });
  }

  queueIntroCordLayout();
}

function delayMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Same player score in every scope — only rank context and neighbours change. */
const LEADERBOARD_YOUR_PTS = '2,480';

const LEADERBOARD_SCOPES = {
  department: {
    label: 'Department',
    aria: 'Department leaderboard',
    more: '287 players below',
    rows: [
      { rank: 2, name: 'Jamie Kim', pts: '2,920', peek: true },
      { rank: 3, name: 'Elena Voss', pts: '2,840' },
      { rank: 4, name: 'Marcus Chen', pts: '2,710' },
      { rank: 5, name: 'Priya Nair', pts: '2,590' },
      { rank: 6, name: 'You', pts: LEADERBOARD_YOUR_PTS, you: true },
      { rank: 7, name: 'Jonas Lind', pts: '2,350' },
      { rank: 8, name: 'Sofia Ruiz', pts: '2,210' },
      { rank: 9, name: 'Alex Morgan', pts: '2,095', peek: true }
    ]
  },
  company: {
    label: 'Company',
    aria: 'Company-wide leaderboard',
    more: '1,312 players below',
    rows: [
      { rank: 136, name: 'N. Okonkwo', pts: '6,240', peek: true },
      { rank: 137, name: 'M. Laurent', pts: '5,180' },
      { rank: 138, name: 'R. Patel', pts: '4,420' },
      { rank: 139, name: 'S. Nguyen', pts: '3,890' },
      { rank: 140, name: 'L. Bergström', pts: '3,210' },
      { rank: 141, name: 'You', pts: LEADERBOARD_YOUR_PTS, you: true },
      { rank: 142, name: 'K. Okafor', pts: '2,050' },
      { rank: 143, name: 'T. Mensah', pts: '1,640' },
      { rank: 144, name: 'A. Dubois', pts: '980', peek: true }
    ]
  }
};

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
  li.innerHTML = `
    <span class="intro-corporate-leaderboard__rank">${entry.rank}</span>
    <span class="intro-corporate-leaderboard__name">${entry.name}</span>
    <span class="intro-corporate-leaderboard__pts">${entry.pts}</span>
  `;
  return li;
}

function renderLeaderboardRows(listEl, scope) {
  const data = LEADERBOARD_SCOPES[scope];
  if (!listEl || !data) return;
  listEl.replaceChildren(...data.rows.map((row, index) => buildLeaderboardRow(row, index)));
}

function applyLeaderboardScopeMeta(panel, scope) {
  const copy = LEADERBOARD_SCOPES[scope];
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

  const current = panel.dataset.leaderboardScope === 'company' ? 'company' : 'department';
  if (current === scope || panel.dataset.leaderboardAnimating === '1') return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const goingDown = scope === 'company';

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
      const scope = btn.dataset.scope === 'company' ? 'company' : 'department';

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
  board.querySelector('.intro-corporate-nav')?.classList.add('intro-corporate-pop-target');
  board.querySelector('.intro-corporate-board__copy')?.classList.add('intro-corporate-pop-target');
  board.querySelector('.intro-corporate-leaderboard-panel')?.classList.add('intro-corporate-pop-target');
  board.querySelector('.intro-corporate-activity')?.classList.add('intro-corporate-pop-target');
  gridEl?.querySelectorAll('.intro-module-wrap').forEach((wrap) => {
    wrap.classList.add('intro-corporate-pop-target');
  });
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
  startCordFloat();
  queueIntroCordLayout();
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

function refreshSubwayCordGeometry() {
  for (const seg of cordRopeSegments) refreshCordSegmentEndpoints(seg);
  applySubwayLaneBundles(cordRopeSegments);
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

function animatePlugWire(sourceMod, outcome, sourceCard) {
  const edgeKeyStr = outcome.fills?.[0];
  const targetId = outcome.unlocks?.[0];
  if (!edgeKeyStr || !targetId) return;

  const { toId } = parseEdgeKey(edgeKeyStr);
  const targetWrap = pathMapEl?.querySelector(`[data-module-anchor="${toId || targetId}"]`);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  stopIntroAuto();
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

    sourceCard?.classList.remove('is-plug-source');
    targetWrap?.classList.remove('is-plug-target');
    hideCordTooltip();

    const newlyUnlocked = applyPlayOutcome(sourceMod.id, outcome);
    recordPlayActivity(getRuntimeModule(sourceMod.id) ?? sourceMod, outcome, newlyUnlocked);
    patchModulesFromRuntime(newlyUnlocked);
    highlightUnlockedModules(newlyUnlocked);
    focusModuleCard(targetId);

    clearPlugState();
    queueIntroCordLayout();

    maybeStartChapterHandoff(sourceMod.id);
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
    if (introState.progress >= introCfg().dollyEnd && !shouldFreezeModuleReveal()) {
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

  let cameraY = stops.home;
  if (p >= introCfg().modulesCameraStart) {
    const span = 1 - introCfg().modulesCameraStart;
    const t = span > 0 ? Math.min(1, (p - introCfg().modulesCameraStart) / span) : 1;
    cameraY =
      stops.chapterSettled +
      (stops.modulesSettled - stops.chapterSettled) * easeInOutCubic(t);
  } else if (p >= introCfg().dollyStart) {
    const span = introCfg().dollyEnd - introCfg().dollyStart;
    const t = span > 0 ? Math.min(1, (p - introCfg().dollyStart) / span) : 1;
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
    p >= introCfg().dollyStart && p < introCfg().modulesCameraStart
  );
  viewport.classList.toggle('is-chapter-settled', p >= introCfg().dollyEnd);
  viewport.classList.toggle('is-modules-visible', revealedCount > 0);

  if (revealedCount > 0) {
    startCordFloat();
    queueIntroCordLayout();
  } else {
    stopCordFloat();
  }

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

function syncCorporateIntroClass() {
  document.documentElement.classList.toggle('is-corporate-intro', isCorporateSkin());
  if (isCorporateSkin()) {
    wireLeaderboardScopes();
    initIntroActivityLog();
    patchModulesFromRuntime();
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

buildStarfield();
initModuleModal();
renderModules();
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

window.addEventListener('wf-progress-change', (event) => {
  if (event.detail?.reset) {
    if (getCurrentChapter() === 2 || isChapterHandoffDone()) {
      window.location.reload();
      return;
    }
    setActiveChapter(1);
    renderModules();
    if (isCorporateSkin()) revealCorporateBoard();
    else queueIntroCordLayout();
    return;
  }
  if (event.detail?.unlockAll) {
    const unlocked = getRuntimeModules().filter((m) => !m.locked).map((m) => m.id);
    if (getCurrentChapter() === 1 && isCorporateSkin()) revealCorporateBoard();
    patchModulesFromRuntime(unlocked);
    queueIntroCordLayout();
    return;
  }
  patchModulesFromRuntime(event.detail?.newlyUnlocked ?? []);
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

if (getCurrentChapter() === 2 && isChapterHandoffDone()) {
  bootstrapChapter2View();
} else {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      runIntroSequence();
    });
  });
}

import { CONSEQUENCE_MODULES, getChapterCapsLabel } from './consequence-flow.js';
import {
  computeEmpathyScore,
  EMPATHY_SCORE_FOUR_STARS,
  starsFromEmpathyScore
} from './empathy-score.js';
import { getPlayScenario, getRuntimeModule, syncModuleScoresFromActivity } from './consequence-progress.js';

const STORAGE_KEY = 'wf-proto-activity-log';
const MAX_STORED = 80;
const VISIBLE_ROWS = 7;
const ACTIVITY_MIN_HEIGHT_PX = 104;
const ACTIVITY_MAX_HEIGHT_PX = 184;
const ACTIVITY_FLEX_SHARE = 0.26;
const LB_VIEWPORT_MIN_ROWS = 4;
const LB_VIEWPORT_MAX_ROWS = 7.5;
const SIDE_COLUMN_MIN_PX = 280;
const SIDE_COLUMN_BOTTOM_PAD_PX = 20;
const PROFILE_VH_SHARE = 0.215;
const FEEDBACK_VH_SHARE = 0.17;
const PROFILE_MIN_PX = 152;
const PROFILE_MAX_PX = 212;
const FEEDBACK_MIN_PX = 124;
const FEEDBACK_MAX_PX = 172;
const BRANCH_BLINK_MS = 1200;
const BRANCH_RESOLVE_MS = 420;
const UNLOCK_STAGGER_MS = 140;

let activityHeightObserver = null;

/** @typedef {'played' | 'replayed' | 'scored' | 'decision' | 'branch' | 'unlocked'} ActivityKind */
/** @typedef {'live' | 'replayed'} PlayMode */
/** @typedef {'tl' | 'tr' | 'bl' | 'br'} BranchQuadrant */

/**
 * @typedef {object} ActivityEntry
 * @property {string} id
 * @property {number} at
 * @property {ActivityKind} kind
 * @property {PlayMode} [playMode]
 * @property {string} [moduleId]
 * @property {string} [chapter]
 * @property {string} [title]
 * @property {number} [score]
 * @property {number} [pointsGained]
 * @property {string} [decision]
 * @property {BranchQuadrant} [quadrant]
 * @property {string} [text] legacy plain line
 */

/** @type {ActivityEntry[]} */
let entries = loadEntries();

/** Chunky glyphs — no frame, sit on frosted panel */
/** Decision tree — root split into four branch endpoints (maps to path quadrants). */
const DECISION_TREE_ICON_SVG = `<svg class="intro-corporate-activity__tree-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path class="intro-corporate-activity__tree-edge" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" d="M12 6.25V10.25M12 10.25 6.75 13.25M12 10.25 17.25 13.25M6.75 13.25 5 18M6.75 13.25 8.5 18M17.25 13.25 15.5 18M17.25 13.25 19 18"/>
  <circle class="intro-corporate-activity__tree-node intro-corporate-activity__tree-node--root" cx="12" cy="5" r="2" fill="currentColor"/>
  <circle class="intro-corporate-activity__tree-node" data-quad="tl" cx="5" cy="18.25" r="2" fill="currentColor"/>
  <circle class="intro-corporate-activity__tree-node" data-quad="bl" cx="8.5" cy="18.25" r="2" fill="currentColor"/>
  <circle class="intro-corporate-activity__tree-node" data-quad="tr" cx="15.5" cy="18.25" r="2" fill="currentColor"/>
  <circle class="intro-corporate-activity__tree-node" data-quad="br" cx="19" cy="18.25" r="2" fill="currentColor"/>
</svg>`;

const ACTIVITY_ICON_SVG = {
  played: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="currentColor" d="M8.5 6.75v10.5l9-5.25-9-5.25z"/></svg>`,
  replayed: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 3v5h5"/></svg>`,
  scored: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5.5" y="13.25" width="4" height="6.25" fill="currentColor"/><rect x="10" y="10.25" width="4" height="9.25" fill="currentColor"/><rect x="14.5" y="7.25" width="4" height="12.25" fill="currentColor"/></svg>`,
  decision: DECISION_TREE_ICON_SVG,
  branch: DECISION_TREE_ICON_SVG,
  unlocked: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="square" d="M8.75 12V9.5a3.25 3.25 0 0 1 6.5 0V12"/><rect x="7" y="12" width="10" height="7.25" fill="currentColor"/></svg>`
};

/** @param {ActivityKind | 'unlocked' | 'replayed'} kind */
function createActivityIcon(kind) {
  const icon = document.createElement('span');
  const mod =
    kind === 'unlocked'
      ? 'unlock'
      : kind === 'replayed'
        ? 'replayed'
        : kind === 'scored'
          ? 'score'
          : kind === 'decision' || kind === 'branch'
            ? 'decision'
            : 'play';
  icon.className = `intro-corporate-activity__icon intro-corporate-activity__icon--${mod}`;
  icon.innerHTML = ACTIVITY_ICON_SVG[kind === 'played' ? 'played' : kind] ?? ACTIVITY_ICON_SVG.played;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

/** @param {BranchQuadrant} [selected] */
function createBranchPicker(selected) {
  const wrap = document.createElement('span');
  wrap.className =
    'intro-corporate-activity__branch intro-corporate-activity__icon intro-corporate-activity__icon--decision';
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', 'Decision tree');
  wrap.innerHTML = DECISION_TREE_ICON_SVG;
  if (selected) {
    wrap.classList.add('is-resolved');
    wrap.querySelector(`[data-quad="${selected}"]`)?.classList.add('is-selected');
  }
  return wrap;
}

function moduleIdFromPlayedParts(chapter, title) {
  const t = title?.trim();
  if (!t) return undefined;
  const hit = CONSEQUENCE_MODULES.find((m) => m.title?.trim() === t);
  return hit?.id;
}

function repairMissingScoredEntries() {
  const needs = ['m2'];
  let changed = false;
  for (const moduleId of needs) {
    if (entries.some((e) => e.kind === 'scored' && e.moduleId === moduleId)) continue;
    const playedIdx = entries.findLastIndex(
      (e) =>
        (e.kind === 'played' || e.kind === 'replayed') &&
        (e.moduleId === moduleId || e.title?.trim() === 'First practice')
    );
    if (playedIdx < 0) continue;
    entries.splice(playedIdx + 1, 0, {
      id: `repair-${moduleId}-${Date.now()}`,
      at: entries[playedIdx].at + 1,
      kind: 'scored',
      moduleId,
      score: EMPATHY_SCORE_FOUR_STARS,
      pointsGained: EMPATHY_SCORE_FOUR_STARS
    });
    changed = true;
  }
  if (changed) saveEntries();
}

function loadEntries() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeEntry).filter((e) => e && (e.kind || e.text));
  } catch {
    return [];
  }
}

/** @param {Partial<ActivityEntry>} raw */
function normalizeEntry(raw) {
  if (raw.kind) return /** @type {ActivityEntry} */ ({ ...raw });

  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!text) return /** @type {ActivityEntry} */ ({ ...raw, kind: 'played', text: '' });

  if (text.startsWith('Replayed ')) {
    const rest = text.slice(9);
    const colon = rest.indexOf(':');
    if (colon >= 0) {
      const chapter = rest.slice(0, colon).trim();
      const title = rest.slice(colon + 1).trim();
      return {
        id: raw.id ?? '',
        at: raw.at ?? Date.now(),
        kind: 'played',
        playMode: 'replayed',
        moduleId: moduleIdFromPlayedParts(chapter, title),
        chapter,
        title
      };
    }
    return {
      id: raw.id ?? '',
      at: raw.at ?? Date.now(),
      kind: 'played',
      playMode: 'replayed',
      chapter: rest,
      title: ''
    };
  }

  if (text.startsWith('Played ')) {
    const rest = text.slice(7);
    const colon = rest.indexOf(':');
    if (colon >= 0) {
      const chapter = rest.slice(0, colon).trim();
      const title = rest.slice(colon + 1).trim();
      return {
        id: raw.id ?? '',
        at: raw.at ?? Date.now(),
        kind: 'played',
        playMode: text.startsWith('Played live') ? 'live' : 'live',
        moduleId: moduleIdFromPlayedParts(chapter, title),
        chapter,
        title
      };
    }
    return { id: raw.id ?? '', at: raw.at ?? Date.now(), kind: 'played', playMode: 'live', chapter: rest, title: '' };
  }

  const gained = text.match(/^Gained (\d+) points/);
  if (gained) {
    const score = Number(gained[1]);
    return {
      id: raw.id ?? '',
      at: raw.at ?? Date.now(),
      kind: 'scored',
      score,
      pointsGained: score
    };
  }

  const scored = text.match(/^Scored (\d+) points in empathy$/);
  if (scored) {
    const score = Number(scored[1]);
    return {
      id: raw.id ?? '',
      at: raw.at ?? Date.now(),
      kind: 'scored',
      score,
      pointsGained: score
    };
  }

  if (text.startsWith('Decided to ')) {
    return {
      id: raw.id ?? '',
      at: raw.at ?? Date.now(),
      kind: 'decision',
      decision: text.slice(11).trim()
    };
  }

  if (text.startsWith('Took decision: ')) {
    return {
      id: raw.id ?? '',
      at: raw.at ?? Date.now(),
      kind: 'decision',
      decision: text.slice(15).trim()
    };
  }

  if (text.startsWith('Chose ')) {
    return {
      id: raw.id ?? '',
      at: raw.at ?? Date.now(),
      kind: 'branch',
      decision: text.slice(5).trim(),
      quadrant: 'tl'
    };
  }

  if (text.startsWith('Unlocked ')) {
    const rest = text.slice(9);
    const colon = rest.indexOf(':');
    if (colon >= 0) {
      return {
        id: raw.id ?? '',
        at: raw.at ?? Date.now(),
        kind: 'unlocked',
        chapter: rest.slice(0, colon).trim(),
        title: rest.slice(colon + 1).trim()
      };
    }
    return { id: raw.id ?? '', at: raw.at ?? Date.now(), kind: 'unlocked', chapter: rest, title: '' };
  }

  return { id: raw.id ?? '', at: raw.at ?? Date.now(), kind: 'played', text };
}

function saveEntries() {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function moduleParts(mod) {
  const chapter = getChapterCapsLabel(mod);
  const title = mod.title?.trim() ?? '';
  return { chapter, title };
}

function isBranchOutcome(mod, outcome) {
  const scenario = getPlayScenario(mod.id);
  if (!scenario) return false;
  const list = scenario.outcomes ?? [];
  return list.length > 1 || Boolean(outcome.direction);
}

/** @param {import('./consequence-flow.js').PlayOutcome} outcome */
/** @param {{ id: string, outcomes?: { id: string, direction?: string }[] }} mod */
function quadrantForOutcome(mod, outcome) {
  if (outcome.direction === 'up') return 'tl';
  if (outcome.direction === 'down') return 'bl';
  const scenario = getPlayScenario(mod.id);
  const idx = scenario?.outcomes?.findIndex((o) => o.id === outcome.id) ?? -1;
  const order = /** @type {BranchQuadrant[]} */ (['tl', 'tr', 'bl', 'br']);
  return order[idx >= 0 ? idx % 4 : 0];
}

/**
 * @param {import('./consequence-flow.js').PlayOutcome} outcome
 * @param {string[]} newlyUnlocked
 * @param {{ playMode?: PlayMode }} [options]
 * @returns {Omit<ActivityEntry, 'id' | 'at'>[]}
 */
export function buildActivityEntries(mod, outcome, newlyUnlocked = [], options = {}) {
  /** @type {Omit<ActivityEntry, 'id' | 'at'>[]} */
  const items = [];
  const { chapter, title } = moduleParts(mod);
  const playMode = options.playMode === 'replayed' ? 'replayed' : 'live';

  items.push({
    kind: 'played',
    playMode,
    moduleId: mod.id,
    chapter,
    title
  });

  const score = computeEmpathyScore(mod, outcome);
  if (score != null) {
    items.push({
      kind: 'scored',
      moduleId: mod.id,
      score,
      pointsGained: score
    });
  }

  if (outcome.lastChoice?.trim()) {
    if (isBranchOutcome(mod, outcome)) {
      items.push({
        kind: 'branch',
        moduleId: mod.id,
        decision: outcome.lastChoice.trim(),
        quadrant: quadrantForOutcome(mod, outcome)
      });
    } else {
      items.push({ kind: 'decision', decision: outcome.lastChoice.trim() });
    }
  }

  for (const id of newlyUnlocked) {
    const unlocked = getRuntimeModule(id);
    if (unlocked) {
      const parts = moduleParts(unlocked);
      items.push({ kind: 'unlocked', chapter: parts.chapter, title: parts.title });
    }
  }

  return items;
}

/** @deprecated Use buildActivityEntries — kept for callers expecting strings */
export function buildActivityLines(mod, outcome, newlyUnlocked = []) {
  return buildActivityEntries(mod, outcome, newlyUnlocked).map((item) => entryPlainText(item));
}

function entryPlainText(item) {
  switch (item.kind) {
    case 'played': {
      const label =
        item.title && item.chapter ? `${item.chapter}: ${item.title}` : item.chapter || item.title || '';
      const verb = item.playMode === 'replayed' ? 'Replayed' : 'Played live';
      return `${verb} ${label}`;
    }
    case 'scored':
      return `Gained ${item.pointsGained ?? item.score} points`;
    case 'branch':
      return `Chose ${item.decision ?? ''}`;
    case 'decision':
      return `Decided to ${item.decision}`;
    case 'unlocked': {
      const label =
        item.title && item.chapter ? `${item.chapter}: ${item.title}` : item.chapter || item.title || '';
      return `Unlocked ${label}`;
    }
    default:
      return item.text ?? '';
  }
}

function formatActivityTime(at) {
  const date = new Date(at);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function appendEmphasis(parent, chapter, title) {
  if (chapter) {
    const ch = document.createElement('strong');
    ch.className = 'intro-corporate-activity__emph';
    ch.textContent = chapter;
    parent.append(ch);
  }
  if (chapter && title) parent.append(': ');
  if (title) {
    const name = document.createElement('strong');
    name.className = 'intro-corporate-activity__emph';
    name.textContent = title;
    parent.append(name);
  }
}

/** @param {Omit<ActivityEntry, 'id' | 'at'>} item */
function buildEntryLine(item) {
  const line = document.createElement('span');
  line.className = 'intro-corporate-activity__line';

  switch (item.kind) {
    case 'played':
      if (item.playMode === 'replayed') {
        line.append('Replayed ');
      } else {
        line.append('Played live ');
      }
      appendEmphasis(line, item.chapter, item.title);
      break;
    case 'scored': {
      const starCount = starsFromEmpathyScore(item.score);
      const pts = item.pointsGained ?? item.score;
      line.append('Gained ');
      const ptsEl = document.createElement('strong');
      ptsEl.className = 'intro-corporate-activity__emph';
      ptsEl.textContent = String(pts);
      line.append(ptsEl, ' points');
      if (starCount) {
        line.append(' · ');
        const stars = document.createElement('strong');
        stars.className = 'intro-corporate-activity__emph';
        stars.textContent = `${starCount}/5 stars`;
        line.append(stars);
      }
      break;
    }
    case 'branch':
      line.append('Chose ');
      {
        const d = document.createElement('strong');
        d.className = 'intro-corporate-activity__emph';
        d.textContent = item.decision ?? '';
        line.append(d);
      }
      break;
    case 'decision':
      line.append('Decided to ');
      {
        const d = document.createElement('strong');
        d.className = 'intro-corporate-activity__emph';
        d.textContent = item.decision ?? '';
        line.append(d);
      }
      break;
    case 'unlocked':
      line.append('Unlocked ');
      appendEmphasis(line, item.chapter, item.title);
      break;
    default:
      line.textContent = item.text ?? entryPlainText(item);
  }

  return line;
}

function delayMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** @param {string} entryId */
function animateBranchPicker(entryId) {
  return new Promise((resolve) => {
    const row = document.querySelector(`[data-activity-entry="${entryId}"]`);
    const picker = row?.querySelector('.intro-corporate-activity__branch');
    const quadrant = row?.dataset.branchQuadrant;
    if (!picker || !quadrant) {
      resolve();
      return;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      picker.classList.add('is-resolved');
      picker.querySelector(`[data-quad="${quadrant}"]`)?.classList.add('is-selected');
      resolve();
      return;
    }

    picker.classList.add('is-blinking');
    window.setTimeout(() => {
      picker.classList.remove('is-blinking');
      picker.classList.add('is-resolved');
      picker.querySelectorAll('.intro-corporate-activity__tree-node[data-quad]').forEach((node) => {
        node.classList.toggle('is-selected', node.dataset.quad === quadrant);
      });
      window.setTimeout(resolve, BRANCH_RESOLVE_MS);
    }, BRANCH_BLINK_MS);
  });
}

/** @param {ActivityEntry} entry @param {string | null} [animatingBranchId] */
function createEntryRow(entry, animatingBranchId = null) {
  const li = document.createElement('li');
  const kind = entry.kind ?? 'played';
  li.className = `intro-corporate-activity__row intro-corporate-activity__row--${kind}`;
  li.dataset.activityEntry = entry.id;

  if (kind === 'branch') {
    li.classList.add('intro-corporate-activity__row--branch');
    if (entry.quadrant) li.dataset.branchQuadrant = entry.quadrant;
    const showPick = entry.id !== animatingBranchId ? entry.quadrant : undefined;
    li.appendChild(createBranchPicker(showPick));
  } else {
    const iconKind = kind === 'played' && entry.playMode === 'replayed' ? 'replayed' : kind;
    li.appendChild(createActivityIcon(iconKind));
  }

  const content = document.createElement('div');
  content.className = 'intro-corporate-activity__content';

  content.appendChild(buildEntryLine(entry));

  const time = document.createElement('time');
  time.className = 'intro-corporate-activity__time';
  time.dateTime = new Date(entry.at).toISOString();
  time.textContent = formatActivityTime(entry.at);
  content.appendChild(time);

  li.appendChild(content);
  return li;
}

function measureLbRowStepPx(leaderboard) {
  const sample =
    leaderboard.querySelector('.intro-corporate-leaderboard__row:not(.intro-corporate-leaderboard__row--peek)') ??
    leaderboard.querySelector('.intro-corporate-leaderboard__row');
  const list = leaderboard.querySelector('.intro-corporate-leaderboard__list');
  if (!sample) return 28;
  const rowH = sample.getBoundingClientRect().height;
  const gap = list ? parseFloat(getComputedStyle(list).rowGap || getComputedStyle(list).gap) || 0 : 0;
  return rowH + gap;
}

function clampPx(value, min, max) {
  return Math.round(Math.max(min, Math.min(max, value)));
}

/** Height available for the side column inside #viewport. */
function measureSideColumnHeight(column) {
  const viewportEl = document.getElementById('viewport');
  const colTop = column.getBoundingClientRect().top;
  if (viewportEl) {
    const vp = viewportEl.getBoundingClientRect();
    return Math.max(
      SIDE_COLUMN_MIN_PX,
      Math.floor(vp.bottom - colTop - SIDE_COLUMN_BOTTOM_PAD_PX)
    );
  }
  const vh = window.visualViewport?.height ?? window.innerHeight;
  return Math.max(SIDE_COLUMN_MIN_PX, Math.floor(vh - colTop - SIDE_COLUMN_BOTTOM_PAD_PX));
}

function syncActivityPanelHeight() {
  const column = document.querySelector('.intro-corporate-leaderboard-column');
  const leaderboard = document.getElementById('intro-corporate-leaderboard');
  const activity = document.getElementById('intro-corporate-activity');
  const skin = document.documentElement.dataset.skin;
  if (!column || !leaderboard || !activity || (skin !== 'corporate' && skin !== 'space')) return;

  const columnH = measureSideColumnHeight(column);
  column.style.setProperty('--side-column-height', `${columnH}px`);
  column.style.height = `${columnH}px`;
  column.style.maxHeight = `${columnH}px`;

  const profileH = clampPx(columnH * PROFILE_VH_SHARE, PROFILE_MIN_PX, PROFILE_MAX_PX);
  const feedbackH = clampPx(columnH * FEEDBACK_VH_SHARE, FEEDBACK_MIN_PX, FEEDBACK_MAX_PX);
  column.style.setProperty('--side-profile-height', `${profileH}px`);
  column.style.setProperty('--side-feedback-height', `${feedbackH}px`);

  const gap = parseFloat(getComputedStyle(column).gap) || 9;
  const flexSpace = Math.max(0, columnH - profileH - feedbackH - gap * 3);
  const rowStep = measureLbRowStepPx(leaderboard);
  const lbMinViewport = Math.round(rowStep * LB_VIEWPORT_MIN_ROWS);
  const lbMaxViewport = Math.round(rowStep * LB_VIEWPORT_MAX_ROWS);

  const lbHead = leaderboard.querySelector('.intro-corporate-leaderboard__head');
  const lbMore = leaderboard.querySelector('[data-leaderboard-more]');
  const lbStyles = getComputedStyle(leaderboard);
  const lbPadY = parseFloat(lbStyles.paddingTop) + parseFloat(lbStyles.paddingBottom);
  const lbChrome = (lbHead?.offsetHeight ?? 0) + (lbMore?.offsetHeight ?? 0) + lbPadY;

  let activityH = Math.min(
    ACTIVITY_MAX_HEIGHT_PX,
    Math.max(ACTIVITY_MIN_HEIGHT_PX, Math.round(flexSpace * ACTIVITY_FLEX_SHARE))
  );
  let lbPanelH = flexSpace - activityH;
  const lbNeedMin = lbChrome + lbMinViewport;

  if (lbPanelH < lbNeedMin) {
    activityH = Math.max(ACTIVITY_MIN_HEIGHT_PX, flexSpace - lbNeedMin);
    lbPanelH = flexSpace - activityH;
  }

  const lbViewport = Math.max(lbMinViewport, Math.min(lbMaxViewport, lbPanelH - lbChrome));

  activity.style.setProperty('--activity-panel-height', `${activityH}px`);
  activity.style.height = `${activityH}px`;
  activity.style.maxHeight = `${activityH}px`;
  activity.style.flexBasis = `${activityH}px`;
  leaderboard.style.setProperty('--leaderboard-viewport-height', `${lbViewport}px`);
  leaderboard.style.setProperty('--leaderboard-panel-height', `${lbPanelH}px`);
  leaderboard.style.flexBasis = `${lbPanelH}px`;
  leaderboard.style.height = `${lbPanelH}px`;
  leaderboard.style.maxHeight = `${lbPanelH}px`;
}

function bindActivityPanelHeightSync() {
  if (activityHeightObserver) return;

  const column = document.querySelector('.intro-corporate-leaderboard-column');
  if (!column) return;

  syncActivityPanelHeight();

  const viewportEl = document.getElementById('viewport');

  if (typeof ResizeObserver === 'undefined') {
    window.addEventListener('resize', syncActivityPanelHeight);
    return;
  }

  activityHeightObserver = new ResizeObserver(() => syncActivityPanelHeight());
  activityHeightObserver.observe(column);
  if (viewportEl) activityHeightObserver.observe(viewportEl);
}

function scrollActivityToLatest(viewport) {
  if (!viewport) return;
  const snap = () => {
    viewport.scrollTop = viewport.scrollHeight;
  };
  snap();
  requestAnimationFrame(() => requestAnimationFrame(snap));
}

/** @param {{ animatingBranchId?: string }} [options] */
function render(options = {}) {
  const list = document.getElementById('intro-activity-log-list');
  const panel = document.getElementById('intro-corporate-activity');
  if (!list || !panel) return;

  const viewport = panel.querySelector('.intro-corporate-activity__viewport');
  const { animatingBranchId = null } = options;
  list.replaceChildren();

  if (!entries.length) {
    const empty = document.createElement('li');
    empty.className = 'intro-corporate-activity__row intro-corporate-activity__row--empty';
    empty.textContent = 'Your moves will appear here as you play.';
    list.appendChild(empty);
    if (viewport) viewport.scrollTop = 0;
    return;
  }

  entries.forEach((entry, index) => {
    const row = createEntryRow(entry, animatingBranchId);
    if (index === entries.length - 1) row.dataset.activityAnchor = 'latest';
    if (entry.kind === 'branch' && entry.id !== animatingBranchId) {
      row.querySelector('.intro-corporate-activity__branch')?.classList.add('is-resolved');
      row
        .querySelector(`[data-quad="${entry.quadrant}"]`)
        ?.classList.add('is-selected');
    }
    list.appendChild(row);
  });

  scrollActivityToLatest(viewport);
  syncActivityPanelHeight();
}

function newEntryId(baseAt, index) {
  return `${baseAt}-${index}-${Math.random().toString(36).slice(2, 9)}`;
}

/** @param {Omit<ActivityEntry, 'id' | 'at'>[]} batch */
async function appendActivityBatch(batch, baseAt) {
  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    const entry = /** @type {ActivityEntry} */ ({
      ...item,
      id: newEntryId(baseAt, i),
      at: baseAt + i
    });

    if (item.kind === 'branch') {
      entries.push(entry);
      if (entries.length > MAX_STORED) entries = entries.slice(entries.length - MAX_STORED);
      saveEntries();
      render({ animatingBranchId: entry.id });
      await animateBranchPicker(entry.id);
      continue;
    }

    if (item.kind === 'unlocked') {
      const prev = batch[i - 1];
      if (prev?.kind === 'branch' || prev?.kind === 'unlocked') {
        await delayMs(UNLOCK_STAGGER_MS);
      }
    }

    entries.push(entry);
  }

  if (entries.length > MAX_STORED) {
    entries = entries.slice(entries.length - MAX_STORED);
  }
  saveEntries();
  render();
}

/**
 * @param {{ id: string, title?: string, modal?: { showStats?: boolean } }} mod
 * @param {import('./consequence-flow.js').PlayOutcome} outcome
 * @param {string[]} [newlyUnlocked]
 * @param {{ playMode?: PlayMode }} [options]
 */
export function recordPlayActivity(mod, outcome, newlyUnlocked = [], options = {}) {
  const skin = document.documentElement.dataset.skin;
  if (skin !== 'corporate' && skin !== 'space') return;
  if (!document.getElementById('intro-activity-log-list')) return;

  const baseAt = Date.now();
  const batch = buildActivityEntries(mod, outcome, newlyUnlocked, options);
  void appendActivityBatch(batch, baseAt);
}

export function resetActivityLog() {
  entries = [];
  sessionStorage.removeItem(STORAGE_KEY);
  render();
}

let initialized = false;

/** Re-measure side column + card heights from #viewport (call after panel reveal / resize). */
export function syncIntroSideColumnLayout() {
  syncActivityPanelHeight();
}

export function initIntroActivityLog() {
  const skin = document.documentElement.dataset.skin;
  if (initialized || (skin !== 'corporate' && skin !== 'space')) return;
  initialized = true;
  entries = loadEntries();
  repairMissingScoredEntries();
  syncModuleScoresFromActivity(entries);
  render();
  bindActivityPanelHeightSync();
  requestAnimationFrame(syncActivityPanelHeight);

  window.addEventListener('wf-progress-change', (event) => {
    if (event.detail?.reset) resetActivityLog();
  });
}

export function getActivityLogVisibleRows() {
  return VISIBLE_ROWS;
}

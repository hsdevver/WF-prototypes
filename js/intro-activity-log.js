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
const ACTIVITY_HEIGHT_RATIO = 0.75;
const ACTIVITY_MIN_HEIGHT_PX = 120;
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
const ACTIVITY_ICON_SVG = {
  played: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="currentColor" d="M8.5 6.75v10.5l9-5.25-9-5.25z"/></svg>`,
  replayed: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" d="M7.5 7.5v3.5H4M16.5 16.5v-3.5H20"/><path fill="currentColor" d="M8.5 8.25 6.2 12 8.5 15.75 12 16.5 15.5 15.75 17.8 12 15.5 8.25 12 7.5z"/></svg>`,
  scored: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5.5" y="13.25" width="4" height="6.25" fill="currentColor"/><rect x="10" y="10.25" width="4" height="9.25" fill="currentColor"/><rect x="14.5" y="7.25" width="4" height="12.25" fill="currentColor"/></svg>`,
  decision: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path fill="currentColor" d="M4.5 8.25 9.25 12 4.5 15.75z"/><path fill="currentColor" d="M19.5 8.25 14.75 12 19.5 15.75z"/></svg>`,
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
  const wrap = document.createElement('div');
  wrap.className = 'intro-corporate-activity__branch';
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', 'Path branch choice');

  const ring = document.createElement('div');
  ring.className = 'intro-corporate-activity__branch-ring';

  for (const quad of ['tl', 'tr', 'bl', 'br']) {
    const el = document.createElement('span');
    el.className = `intro-corporate-activity__branch-quad intro-corporate-activity__branch-quad--${quad}`;
    el.dataset.quad = quad;
    if (selected === quad) el.classList.add('is-selected');
    ring.appendChild(el);
  }

  const core = document.createElement('span');
  core.className = 'intro-corporate-activity__branch-core';
  core.setAttribute('aria-hidden', 'true');
  ring.appendChild(core);

  wrap.appendChild(ring);
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
      return `Took decision: ${item.decision}`;
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
      line.append('Took decision: ');
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
      picker.querySelectorAll('.intro-corporate-activity__branch-quad').forEach((q) => {
        q.classList.toggle('is-selected', q.dataset.quad === quadrant);
      });
      window.setTimeout(resolve, BRANCH_RESOLVE_MS);
    }, BRANCH_BLINK_MS);
  });
}

/** @param {ActivityEntry} entry */
function createEntryRow(entry) {
  const li = document.createElement('li');
  const kind = entry.kind ?? 'played';
  li.className = `intro-corporate-activity__row intro-corporate-activity__row--${kind}`;
  li.dataset.activityEntry = entry.id;

  if (kind === 'branch') {
    li.classList.add('intro-corporate-activity__row--branch');
    if (entry.quadrant) li.dataset.branchQuadrant = entry.quadrant;
    li.appendChild(createBranchPicker(entry.quadrant));
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

function syncActivityPanelHeight() {
  const leaderboard = document.getElementById('intro-corporate-leaderboard');
  const activity = document.getElementById('intro-corporate-activity');
  if (!leaderboard || !activity || document.documentElement.dataset.skin !== 'corporate') return;

  const height = Math.max(
    ACTIVITY_MIN_HEIGHT_PX,
    Math.round(leaderboard.getBoundingClientRect().height * ACTIVITY_HEIGHT_RATIO)
  );
  activity.style.setProperty('--activity-panel-height', `${height}px`);
}

function bindActivityPanelHeightSync() {
  if (activityHeightObserver) return;

  const leaderboard = document.getElementById('intro-corporate-leaderboard');
  if (!leaderboard) return;

  syncActivityPanelHeight();

  if (typeof ResizeObserver === 'undefined') {
    window.addEventListener('resize', syncActivityPanelHeight);
    return;
  }

  activityHeightObserver = new ResizeObserver(() => syncActivityPanelHeight());
  activityHeightObserver.observe(leaderboard);
}

function scrollActivityToLatest(viewport) {
  if (!viewport) return;
  const snap = () => {
    viewport.scrollTop = viewport.scrollHeight;
  };
  snap();
  requestAnimationFrame(() => requestAnimationFrame(snap));
}

function render() {
  const list = document.getElementById('intro-activity-log-list');
  const panel = document.getElementById('intro-corporate-activity');
  if (!list || !panel) return;

  const viewport = panel.querySelector('.intro-corporate-activity__viewport');
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
    const row = createEntryRow(entry);
    if (index === entries.length - 1) row.dataset.activityAnchor = 'latest';
    if (entry.kind === 'branch') {
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
      render();
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
  if (document.documentElement.dataset.skin !== 'corporate') return;
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

export function initIntroActivityLog() {
  if (initialized || document.documentElement.dataset.skin !== 'corporate') return;
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

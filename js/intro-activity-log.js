import { CONSEQUENCE_MODULES, getChapterCapsLabel } from './consequence-flow.js';
import {
  computeEmpathyScore,
  EMPATHY_SCORE_FOUR_STARS,
  starsFromEmpathyScore
} from './empathy-score.js';
import { getRuntimeModule, syncModuleScoresFromActivity } from './consequence-progress.js';

const STORAGE_KEY = 'wf-proto-activity-log';
const MAX_STORED = 80;
const VISIBLE_ROWS = 7;
const ACTIVITY_HEIGHT_RATIO = 0.75;
const ACTIVITY_MIN_HEIGHT_PX = 120;

let activityHeightObserver = null;

/** @typedef {'played' | 'scored' | 'decision' | 'unlocked'} ActivityKind */

/**
 * @typedef {object} ActivityEntry
 * @property {string} id
 * @property {number} at
 * @property {ActivityKind} kind
 * @property {string} [moduleId]
 * @property {string} [chapter]
 * @property {string} [title]
 * @property {number} [score]
 * @property {string} [decision]
 * @property {string} [text] legacy plain line
 */

/** @type {ActivityEntry[]} */
let entries = loadEntries();

/** Chunky glyphs — no frame, sit on frosted panel */
const ACTIVITY_ICON_SVG = {
  played: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="currentColor" d="M8.5 6.75v10.5l9-5.25-9-5.25z"/></svg>`,
  scored: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5.5" y="13.25" width="4" height="6.25" fill="currentColor"/><rect x="10" y="10.25" width="4" height="9.25" fill="currentColor"/><rect x="14.5" y="7.25" width="4" height="12.25" fill="currentColor"/></svg>`,
  decision: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path fill="currentColor" d="M4.5 8.25 9.25 12 4.5 15.75z"/><path fill="currentColor" d="M19.5 8.25 14.75 12 19.5 15.75z"/></svg>`,
  unlocked: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="square" d="M8.75 12V9.5a3.25 3.25 0 0 1 6.5 0V12"/><rect x="7" y="12" width="10" height="7.25" fill="currentColor"/></svg>`
};

/** @param {ActivityKind | 'unlocked'} kind */
function createActivityIcon(kind) {
  const icon = document.createElement('span');
  const mod =
    kind === 'unlocked' ? 'unlock' : kind === 'scored' ? 'score' : kind === 'decision' ? 'decision' : 'play';
  icon.className = `intro-corporate-activity__icon intro-corporate-activity__icon--${mod}`;
  icon.innerHTML = ACTIVITY_ICON_SVG[kind] ?? ACTIVITY_ICON_SVG.played;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
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
        e.kind === 'played' &&
        (e.moduleId === moduleId || e.title?.trim() === 'First practice')
    );
    if (playedIdx < 0) continue;
    entries.splice(playedIdx + 1, 0, {
      id: `repair-${moduleId}-${Date.now()}`,
      at: entries[playedIdx].at + 1,
      kind: 'scored',
      moduleId,
      score: EMPATHY_SCORE_FOUR_STARS
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
        moduleId: moduleIdFromPlayedParts(chapter, title),
        chapter,
        title
      };
    }
    return { id: raw.id ?? '', at: raw.at ?? Date.now(), kind: 'played', chapter: rest, title: '' };
  }

  const scored = text.match(/^Scored (\d+) points in empathy$/);
  if (scored) {
    return {
      id: raw.id ?? '',
      at: raw.at ?? Date.now(),
      kind: 'scored',
      score: Number(scored[1])
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

/**
 * @param {import('./consequence-flow.js').PlayOutcome} outcome
 * @param {string[]} newlyUnlocked
 * @returns {Omit<ActivityEntry, 'id' | 'at'>[]}
 */
export function buildActivityEntries(mod, outcome, newlyUnlocked = []) {
  /** @type {Omit<ActivityEntry, 'id' | 'at'>[]} */
  const items = [];
  const { chapter, title } = moduleParts(mod);

  items.push({ kind: 'played', moduleId: mod.id, chapter, title });

  const score = computeEmpathyScore(mod, outcome);
  if (score != null) items.push({ kind: 'scored', moduleId: mod.id, score });

  if (outcome.lastChoice?.trim()) {
    items.push({ kind: 'decision', decision: outcome.lastChoice.trim() });
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
      return `Played ${label}`;
    }
    case 'scored':
      return `Scored ${item.score} points in empathy`;
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
      line.append('Played ');
      appendEmphasis(line, item.chapter, item.title);
      break;
    case 'scored': {
      const starCount = starsFromEmpathyScore(item.score);
      line.append('Scored ');
      const pts = document.createElement('strong');
      pts.className = 'intro-corporate-activity__emph';
      pts.textContent = String(item.score);
      line.append(pts, ' points in empathy');
      if (starCount) {
        line.append(' · ');
        const stars = document.createElement('strong');
        stars.className = 'intro-corporate-activity__emph';
        stars.textContent = `${starCount}/5 stars`;
        line.append(stars);
      }
      break;
    }
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

/** @param {ActivityEntry} entry */
function createEntryRow(entry) {
  const li = document.createElement('li');
  const kind = entry.kind ?? 'played';
  li.className = `intro-corporate-activity__row intro-corporate-activity__row--${kind}`;

  li.appendChild(createActivityIcon(kind));

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
    list.appendChild(row);
  });

  scrollActivityToLatest(viewport);
  syncActivityPanelHeight();
}

/**
 * @param {{ id: string, title?: string, modal?: { showStats?: boolean } }} mod
 * @param {import('./consequence-flow.js').PlayOutcome} outcome
 * @param {string[]} [newlyUnlocked]
 */
export function recordPlayActivity(mod, outcome, newlyUnlocked = []) {
  if (document.documentElement.dataset.skin !== 'corporate') return;
  if (!document.getElementById('intro-activity-log-list')) return;

  const at = Date.now();
  const batch = buildActivityEntries(mod, outcome, newlyUnlocked);

  for (const item of batch) {
    entries.push({
      ...item,
      id: `${at}-${Math.random().toString(36).slice(2, 9)}`,
      at
    });
  }

  if (entries.length > MAX_STORED) {
    entries = entries.slice(entries.length - MAX_STORED);
  }
  saveEntries();
  render();
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

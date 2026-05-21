import {
  CHAPTER_1_END_MODULE_ID,
  getChapterGraph
} from './consequence-flow.js';
import {
  computeEmpathyScore,
  EMPATHY_SCORE_FLOOR,
  EMPATHY_SCORE_FOUR_STARS,
  starsFromEmpathyScore
} from './empathy-score.js';

const STORAGE_KEY = 'wf-consequence-progress';

const PLAYED_BACKFILL_SCORES = {
  m2: EMPATHY_SCORE_FOUR_STARS,
  m8: EMPATHY_SCORE_FLOOR
};

function createInitialState() {
  return {
    currentChapter: 1,
    chapterHandoffDone: false,
    unlocked: ['m1'],
    completed: [],
    filledEdges: [],
    lastChoices: {},
    lastDirections: {},
    edgeLabels: {},
    moduleScores: {}
  };
}

function repairFilledEdgeUnlocks(state) {
  let changed = false;
  for (const key of state.filledEdges) {
    const toId = key.split('|')[1];
    if (toId && !state.unlocked.includes(toId)) {
      state.unlocked.push(toId);
      changed = true;
    }
  }
  return changed;
}

function hasPlayedModule(state, moduleId) {
  return (
    state.completed.includes(moduleId) ||
    Boolean(state.lastChoices[moduleId]) ||
    state.filledEdges.some((key) => key.startsWith(`${moduleId}|`))
  );
}

/** Pin played scored modules to 4★ when score missing or not yet 4★. */
function repairModuleScore(state, moduleId) {
  if (!hasPlayedModule(state, moduleId)) return false;
  const prev = state.moduleScores[moduleId];
  if (typeof prev === 'number' && starsFromEmpathyScore(prev) === 4) return false;
  state.moduleScores[moduleId] = EMPATHY_SCORE_FOUR_STARS;
  return true;
}

/** Pin played m8 to 1★ when score missing or would show 5★ from completion alone. */
function repairModuleOneStarScore(state, moduleId) {
  if (moduleId !== 'm8' || !hasPlayedModule(state, moduleId)) return false;
  const prev = state.moduleScores[moduleId];
  if (typeof prev === 'number' && starsFromEmpathyScore(prev) === 1) return false;
  state.moduleScores[moduleId] = EMPATHY_SCORE_FLOOR;
  return true;
}

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    const state = {
      currentChapter: parsed.currentChapter === 2 ? 2 : 1,
      chapterHandoffDone: Boolean(parsed.chapterHandoffDone),
      unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : ['m1'],
      completed: Array.isArray(parsed.completed) ? parsed.completed : [],
      filledEdges: Array.isArray(parsed.filledEdges) ? parsed.filledEdges : [],
      lastChoices:
        parsed.lastChoices && typeof parsed.lastChoices === 'object' ? parsed.lastChoices : {},
      lastDirections:
        parsed.lastDirections && typeof parsed.lastDirections === 'object'
          ? parsed.lastDirections
          : {},
      edgeLabels:
        parsed.edgeLabels && typeof parsed.edgeLabels === 'object' ? parsed.edgeLabels : {},
      moduleScores:
        parsed.moduleScores && typeof parsed.moduleScores === 'object' ? parsed.moduleScores : {}
    };
    let repaired = repairFilledEdgeUnlocks(state);
    if (repairModuleScore(state, 'm2')) repaired = true;
    if (repairModuleScore(state, 'm6')) repaired = true;
    if (repairModuleOneStarScore(state, 'm8')) repaired = true;
    if (repaired) saveState(state);
    return state;
  } catch {
    return createInitialState();
  }
}

function saveState(state) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

function notifyChange(detail = {}) {
  window.dispatchEvent(new CustomEvent('wf-progress-change', { detail }));
}

function moduleCatalog() {
  return getChapterGraph(state.currentChapter).modules;
}

export function resetConsequenceProgress() {
  state = createInitialState();
  saveState(state);
  notifyChange({ reset: true });
}

function allModuleIds() {
  const ids = new Set();
  for (const chapter of [1, 2]) {
    for (const mod of getChapterGraph(chapter).modules) ids.add(mod.id);
  }
  return [...ids];
}

/** Cheat: unlock every module in both chapters; mark chapter handoff done. */
export function unlockAllConsequenceProgress() {
  const allIds = allModuleIds();
  const before = new Set(state.unlocked);
  state.unlocked = allIds;
  state.chapterHandoffDone = true;
  saveState(state);
  const newlyUnlocked = allIds.filter((id) => !before.has(id));
  notifyChange({ unlockAll: true, newlyUnlocked });
}

export function getCurrentChapter() {
  return state.currentChapter;
}

export function isChapterHandoffDone() {
  return state.chapterHandoffDone;
}

export function isChapter1Complete() {
  return state.completed.includes(CHAPTER_1_END_MODULE_ID);
}

export function beginChapter2() {
  state.currentChapter = 2;
  state.chapterHandoffDone = true;
  if (!state.unlocked.includes('c2m1')) state.unlocked.push('c2m1');
  saveState(state);
  notifyChange({ chapter: 2 });
}

export function getRuntimeModule(id) {
  const base = moduleCatalog().find((m) => m.id === id);
  if (!base) return null;
  const empathyScore =
    typeof state.moduleScores[id] === 'number' ? state.moduleScores[id] : null;

  return {
    ...base,
    locked: !state.unlocked.includes(id),
    completed: state.completed.includes(id),
    lastChoice: state.lastChoices[id] ?? null,
    lastDirection: state.lastDirections[id] ?? null,
    empathyScore
  };
}

export function getModuleEmpathyScore(moduleId) {
  const n = state.moduleScores[moduleId];
  return typeof n === 'number' ? n : null;
}

/**
 * Merge empathy scores from activity log (e.g. after reload).
 * @param {{ kind?: string, moduleId?: string, score?: number }[]} activityEntries
 */
export function syncModuleScoresFromActivity(activityEntries) {
  let changed = false;
  for (const entry of activityEntries) {
    if (entry.kind !== 'scored' || !entry.moduleId || typeof entry.score !== 'number') continue;
    const prev = state.moduleScores[entry.moduleId];
    const next = typeof prev === 'number' ? Math.max(prev, entry.score) : entry.score;
    if (next !== prev) {
      state.moduleScores[entry.moduleId] = next;
      changed = true;
    }
  }
  for (const entry of activityEntries) {
    if (entry.kind !== 'played' || !entry.moduleId) continue;
    const fill = PLAYED_BACKFILL_SCORES[entry.moduleId];
    if (fill == null || typeof state.moduleScores[entry.moduleId] === 'number') continue;
    if (!hasPlayedModule(state, entry.moduleId)) continue;
    state.moduleScores[entry.moduleId] = fill;
    changed = true;
  }
  if (repairModuleOneStarScore(state, 'm8')) changed = true;
  if (changed) {
    saveState(state);
    notifyChange();
  }
}

export function getRuntimeModules() {
  return moduleCatalog().map((m) => getRuntimeModule(m.id));
}

export function getChapterEdges() {
  return getChapterGraph(state.currentChapter).edges;
}

export function getChapterCordAnchors() {
  return getChapterGraph(state.currentChapter).cordAnchors;
}

export function isEdgeFilled(key) {
  return state.filledEdges.includes(key);
}

export function getFilledEdgeKeys() {
  return [...state.filledEdges];
}

export function getEdgeChoiceLabel(edgeKey) {
  return state.edgeLabels[edgeKey] ?? null;
}

/**
 * @param {string} moduleId
 * @param {import('./consequence-flow.js').PlayOutcome} outcome
 * @returns {string[]} newly unlocked module ids
 */
export function applyPlayOutcome(moduleId, outcome) {
  const before = new Set(state.unlocked);

  for (const id of outcome.unlocks ?? []) {
    if (!state.unlocked.includes(id)) state.unlocked.push(id);
  }
  for (const key of outcome.fills ?? []) {
    if (!state.filledEdges.includes(key)) state.filledEdges.push(key);
    const toId = key.split('|')[1];
    if (toId && !state.unlocked.includes(toId)) state.unlocked.push(toId);
    const label = outcome.lastChoice || outcome.label;
    if (label) state.edgeLabels[key] = label;
  }
  if (!state.completed.includes(moduleId)) state.completed.push(moduleId);
  if (outcome.lastChoice) state.lastChoices[moduleId] = outcome.lastChoice;
  if (outcome.direction) state.lastDirections[moduleId] = outcome.direction;

  const base = moduleCatalog().find((m) => m.id === moduleId);
  const score = computeEmpathyScore(base, outcome);
  if (score != null) {
    const prev = state.moduleScores[moduleId];
    state.moduleScores[moduleId] =
      typeof prev === 'number' ? Math.max(prev, score) : score;
  }

  saveState(state);

  const newlyUnlocked = (outcome.unlocks ?? []).filter((id) => !before.has(id));
  notifyChange({ moduleId, newlyUnlocked });
  return newlyUnlocked;
}

export function getPlayScenario(moduleId) {
  return getChapterGraph(state.currentChapter).scenarios[moduleId] ?? null;
}

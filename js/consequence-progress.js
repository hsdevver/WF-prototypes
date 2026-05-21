import {
  CHAPTER_1_END_MODULE_ID,
  CHAPTER_2_END_MODULE_ID,
  CHAPTER_3_END_MODULE_ID,
  getChapterGraph,
  MODULE_STAR_UNLOCK_GATES
} from './consequence-flow.js';
import {
  computeEmpathyScore,
  EMPATHY_SCORE_FLOOR,
  EMPATHY_SCORE_FOUR_STARS,
  starsFromEmpathyScore
} from './empathy-score.js';

const STORAGE_KEY = 'wf-consequence-progress';
const CORPORATE_VOLUME_CHEAT_KEY = 'wf-cheat-corporate-volumes';

/** @returns {'all' | 'locked' | null} */
export function getCorporateVolumeCheatMode() {
  const mode = sessionStorage.getItem(CORPORATE_VOLUME_CHEAT_KEY);
  return mode === 'all' || mode === 'locked' ? mode : null;
}

/** @param {'all' | 'locked' | null} mode */
export function setCorporateVolumeCheatMode(mode) {
  if (mode) sessionStorage.setItem(CORPORATE_VOLUME_CHEAT_KEY, mode);
  else sessionStorage.removeItem(CORPORATE_VOLUME_CHEAT_KEY);
}

const PLAYED_BACKFILL_SCORES = {
  m2: EMPATHY_SCORE_FOUR_STARS,
  m8: EMPATHY_SCORE_FLOOR
};

function createInitialState() {
  return {
    currentChapter: 1,
    chapterHandoffDone: false,
    chapter3HandoffDone: false,
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
    const chapter =
      parsed.currentChapter === 2 || parsed.currentChapter === 3 ? parsed.currentChapter : 1;
    const state = {
      currentChapter: chapter,
      chapterHandoffDone: Boolean(parsed.chapterHandoffDone),
      chapter3HandoffDone: Boolean(parsed.chapter3HandoffDone),
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

/** When set, module/cord catalog reads this chapter (corporate volume browse). */
let catalogChapter = null;

function notifyChange(detail = {}) {
  window.dispatchEvent(new CustomEvent('wf-progress-change', { detail }));
}

export function getCatalogChapter() {
  return catalogChapter ?? state.currentChapter;
}

/** @param {number | null} chapter — null resets to progress chapter */
export function setCatalogChapter(chapter) {
  catalogChapter = chapter === state.currentChapter ? null : chapter;
}

function moduleCatalog() {
  return getChapterGraph(getCatalogChapter()).modules;
}

export function resetConsequenceProgress() {
  state = createInitialState();
  catalogChapter = null;
  setCorporateVolumeCheatMode(null);
  saveState(state);
  notifyChange({ reset: true });
}

function moduleIdsForChapter(chapter) {
  return getChapterGraph(chapter).modules.map((mod) => mod.id);
}

/** First module in a volume (CHAPTER 1 / `start: true`) — stays unlocked after volume lock cheat. */
function volumeStartModuleId(chapter) {
  const graph = getChapterGraph(chapter);
  const start = graph.modules.find((mod) => mod.start);
  return start?.id ?? graph.modules[0]?.id ?? null;
}

function edgeTouchesChapter(edgeKeyStr, moduleIdSet) {
  const [from, to] = edgeKeyStr.split('|');
  return moduleIdSet.has(from) || moduleIdSet.has(to);
}

/** Cheat: lock every module in one volume except its CHAPTER 1 entry (`start` module). */
export function lockVolumeModules(chapter) {
  const vol = chapter === 2 || chapter === 3 ? chapter : 1;
  const ids = new Set(moduleIdsForChapter(vol));
  const startId = volumeStartModuleId(vol);

  state.unlocked = state.unlocked.filter((id) => !ids.has(id));
  state.completed = state.completed.filter((id) => !ids.has(id));
  state.filledEdges = state.filledEdges.filter((key) => !edgeTouchesChapter(key, ids));
  for (const id of ids) {
    delete state.lastChoices[id];
    delete state.lastDirections[id];
    delete state.moduleScores[id];
  }
  for (const key of Object.keys(state.edgeLabels)) {
    if (edgeTouchesChapter(key, ids)) delete state.edgeLabels[key];
  }

  if (startId && !state.unlocked.includes(startId)) state.unlocked.push(startId);

  if (vol === 1) {
    state.currentChapter = 1;
    state.chapterHandoffDone = false;
    state.chapter3HandoffDone = false;
  } else if (vol === 2) {
    state.chapterHandoffDone = false;
    if (state.currentChapter >= 2) state.currentChapter = 1;
  } else if (vol === 3) {
    state.chapter3HandoffDone = false;
    if (state.currentChapter === 3) state.currentChapter = state.chapterHandoffDone ? 2 : 1;
  }

  saveState(state);
  notifyChange({ lockVolume: vol });
}

function simulateChapterPlayState(chapter) {
  const graph = getChapterGraph(chapter);
  const filledEdges = [];
  const lastChoices = {};
  const lastDirections = {};
  const edgeLabels = {};
  const moduleScores = {};

  for (const [from, to] of graph.edges) {
    const key = edgeKey(from, to);
    filledEdges.push(key);
    edgeLabels[key] = 'Completed';
  }

  for (const [moduleId, scenario] of Object.entries(graph.scenarios)) {
    const outcome = scenario.outcomes?.[0];
    if (!outcome) continue;
    if (outcome.lastChoice) lastChoices[moduleId] = outcome.lastChoice;
    if (outcome.direction) lastDirections[moduleId] = outcome.direction;
  }

  for (const mod of graph.modules) {
    if (!mod.modal?.showStats) continue;
    moduleScores[mod.id] = mod.id === 'm8' ? EMPATHY_SCORE_FLOOR : EMPATHY_SCORE_FOUR_STARS;
  }

  return { filledEdges, lastChoices, lastDirections, edgeLabels, moduleScores };
}

/** Cheat: unlock and mark played all modules in one corporate volume. */
export function unlockVolumeModules(chapter) {
  const vol = chapter === 2 || chapter === 3 ? chapter : 1;
  const graph = getChapterGraph(vol);
  const ids = graph.modules.map((mod) => mod.id);
  const before = new Set(state.unlocked);
  const simulated = simulateChapterPlayState(vol);

  for (const id of ids) {
    if (!state.unlocked.includes(id)) state.unlocked.push(id);
    if (!state.completed.includes(id)) state.completed.push(id);
  }

  for (const key of simulated.filledEdges) {
    if (!state.filledEdges.includes(key)) state.filledEdges.push(key);
    state.edgeLabels[key] = simulated.edgeLabels[key];
  }

  Object.assign(state.lastChoices, simulated.lastChoices);
  Object.assign(state.lastDirections, simulated.lastDirections);
  Object.assign(state.moduleScores, simulated.moduleScores);

  if (vol >= 2) state.chapterHandoffDone = true;
  if (vol >= 3) state.chapter3HandoffDone = true;
  if (vol > state.currentChapter) state.currentChapter = vol;

  saveState(state);
  const newlyUnlocked = ids.filter((id) => !before.has(id));
  notifyChange({ unlockVolume: vol, newlyUnlocked, simulatedPlay: true });
}

function allModuleIds() {
  const ids = new Set();
  for (const chapter of [1, 2, 3]) {
    for (const mod of getChapterGraph(chapter).modules) ids.add(mod.id);
  }
  return [...ids];
}

function edgeKey(from, to) {
  return `${from}|${to}`;
}

function simulateFullPlayState() {
  const filledEdges = [];
  const lastChoices = {};
  const lastDirections = {};
  const edgeLabels = {};
  const moduleScores = { ...state.moduleScores };

  for (const chapter of [1, 2, 3]) {
    const graph = getChapterGraph(chapter);

    for (const [from, to] of graph.edges) {
      const key = edgeKey(from, to);
      if (!filledEdges.includes(key)) filledEdges.push(key);
      edgeLabels[key] = edgeLabels[key] ?? 'Completed';
    }

    for (const [moduleId, scenario] of Object.entries(graph.scenarios)) {
      const outcome = scenario.outcomes?.[0];
      if (!outcome) continue;
      if (outcome.lastChoice) lastChoices[moduleId] = outcome.lastChoice;
      if (outcome.direction) lastDirections[moduleId] = outcome.direction;
    }

    for (const mod of graph.modules) {
      if (!mod.modal?.showStats) continue;
      if (mod.id === 'm8') {
        moduleScores[mod.id] = EMPATHY_SCORE_FLOOR;
      } else {
        moduleScores[mod.id] = EMPATHY_SCORE_FOUR_STARS;
      }
    }
  }

  return { filledEdges, lastChoices, lastDirections, edgeLabels, moduleScores };
}

/** Cheat: unlock every module, fill all path tubes, and mark all as played with stars. */
export function unlockAllConsequenceProgress() {
  const allIds = allModuleIds();
  const before = new Set(state.unlocked);
  const simulated = simulateFullPlayState();

  state.unlocked = allIds;
  state.completed = [...allIds];
  state.filledEdges = simulated.filledEdges;
  state.lastChoices = simulated.lastChoices;
  state.lastDirections = simulated.lastDirections;
  state.edgeLabels = simulated.edgeLabels;
  state.moduleScores = simulated.moduleScores;
  state.chapterHandoffDone = true;
  state.chapter3HandoffDone = true;
  state.currentChapter = 3;

  saveState(state);
  const newlyUnlocked = allIds.filter((id) => !before.has(id));
  notifyChange({ unlockAll: true, newlyUnlocked, simulatedPlay: true });
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
  catalogChapter = null;
  if (!state.unlocked.includes('c2m1')) state.unlocked.push('c2m1');
  saveState(state);
  notifyChange({ chapter: 2 });
}

export function isChapter3HandoffDone() {
  return state.chapter3HandoffDone;
}

export function isChapter2Complete() {
  return state.completed.includes(CHAPTER_2_END_MODULE_ID);
}

export function beginChapter3() {
  state.currentChapter = 3;
  state.chapter3HandoffDone = true;
  catalogChapter = null;
  if (!state.unlocked.includes('c3m1')) state.unlocked.push('c3m1');
  saveState(state);
  notifyChange({ chapter: 3 });
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

/** True when this module already has a persisted star score from a prior play. */
export function hadEarnedStarsBeforePlay(moduleId) {
  const score = state.moduleScores[moduleId];
  return typeof score === 'number' && starsFromEmpathyScore(score) > 0;
}

/** Activity log mode — call before applyPlayOutcome so the current run is not counted. */
export function playModeBeforeOutcome(moduleId) {
  return hadEarnedStarsBeforePlay(moduleId) ? 'replayed' : 'live';
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
  return getChapterGraph(getCatalogChapter()).edges;
}

export function getChapterCordAnchors() {
  return getChapterGraph(getCatalogChapter()).cordAnchors;
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

function resolveScoreAfterPlay(moduleId, outcome) {
  const base = moduleCatalog().find((m) => m.id === moduleId);
  let score = computeEmpathyScore(base, outcome);
  if (score == null) return null;

  const prev = state.moduleScores[moduleId];
  let nextScore = typeof prev === 'number' ? Math.max(prev, score) : score;
  const wasPlayed = state.completed.includes(moduleId);
  if (moduleId === 'm8' && wasPlayed && starsFromEmpathyScore(nextScore) < 4) {
    nextScore = Math.max(nextScore, EMPATHY_SCORE_FOUR_STARS);
  }
  return nextScore;
}

/**
 * @param {string} moduleId
 * @param {import('./consequence-flow.js').PlayOutcome} outcome
 * @returns {boolean}
 */
export function wouldBlockStarGateUnlock(moduleId, outcome) {
  const gate = MODULE_STAR_UNLOCK_GATES[moduleId];
  if (!gate) return false;

  const score = resolveScoreAfterPlay(moduleId, outcome);
  if (score == null) return false;
  return starsFromEmpathyScore(score) < gate.minStars;
}

/**
 * @param {string} moduleId
 * @param {import('./consequence-flow.js').PlayOutcome} outcome
 * @returns {{ newlyUnlocked: string[], starGateBlocked: boolean }}
 */
export function applyPlayOutcome(moduleId, outcome) {
  const before = new Set(state.unlocked);
  const gate = MODULE_STAR_UNLOCK_GATES[moduleId];

  let unlocks = [...(outcome.unlocks ?? [])];
  let fills = [...(outcome.fills ?? [])];

  let score = resolveScoreAfterPlay(moduleId, outcome);

  let starGateBlocked = false;
  if (gate && score != null && starsFromEmpathyScore(score) < gate.minStars) {
    starGateBlocked = true;
    const blockedUnlocks = new Set(gate.unlocks);
    const blockedFills = new Set(gate.fills);
    unlocks = unlocks.filter((id) => !blockedUnlocks.has(id));
    fills = fills.filter((key) => !blockedFills.has(key));
  }

  for (const id of unlocks) {
    if (!state.unlocked.includes(id)) state.unlocked.push(id);
  }
  for (const key of fills) {
    if (!state.filledEdges.includes(key)) state.filledEdges.push(key);
    const toId = key.split('|')[1];
    if (toId && !state.unlocked.includes(toId)) state.unlocked.push(toId);
    const label = outcome.lastChoice || outcome.label;
    if (label) state.edgeLabels[key] = label;
  }
  if (!state.completed.includes(moduleId)) state.completed.push(moduleId);
  if (outcome.lastChoice) state.lastChoices[moduleId] = outcome.lastChoice;
  if (outcome.direction) state.lastDirections[moduleId] = outcome.direction;

  if (score != null) {
    state.moduleScores[moduleId] = score;
  }

  saveState(state);

  const newlyUnlocked = unlocks.filter((id) => !before.has(id));
  notifyChange({ moduleId, newlyUnlocked, starGateBlocked });
  return { newlyUnlocked, starGateBlocked };
}

export function getPlayScenario(moduleId) {
  return getChapterGraph(getCatalogChapter()).scenarios[moduleId] ?? null;
}

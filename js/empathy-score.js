/** Empathy points → star rating (shared by cards, activity log, progress). */

export const EMPATHY_SCORE_FLOOR = 52;
export const EMPATHY_SCORE_CEIL = 92;

/** Empathy points that map to exactly 4/5 stars (76–83 range). */
export const EMPATHY_SCORE_FOUR_STARS = 80;

/**
 * @param {{ id?: string, modal?: { showStats?: boolean } }} mod
 * @param {{ id?: string, label?: string, empathyScore?: number }} [outcome]
 * @returns {number | null}
 */
export function computeEmpathyScore(mod, outcome) {
  if (typeof outcome?.empathyScore === 'number') return outcome.empathyScore;
  if (!mod?.modal?.showStats) return null;
  const key = `${mod.id}|${outcome?.id ?? outcome?.label ?? ''}`;
  let n = 0;
  for (let i = 0; i < key.length; i++) n += key.charCodeAt(i);
  return EMPATHY_SCORE_FLOOR + (n % (EMPATHY_SCORE_CEIL - EMPATHY_SCORE_FLOOR + 1));
}

/**
 * @param {number | null | undefined} score
 * @returns {number} 0–5
 */
export function starsFromEmpathyScore(score) {
  if (score == null || score < 1) return 0;
  const clamped = Math.max(EMPATHY_SCORE_FLOOR, Math.min(EMPATHY_SCORE_CEIL, Math.round(score)));
  return Math.min(5, Math.max(1, Math.ceil((clamped - (EMPATHY_SCORE_FLOOR - 1)) / 8)));
}

/**
 * @param {{ locked?: boolean, completed?: boolean, empathyScore?: number | null, modal?: { showStats?: boolean } }} mod
 * @returns {number} 0–5
 */
export function starsForModule(mod) {
  if (mod.locked) return 0;
  if (mod.empathyScore != null) return starsFromEmpathyScore(mod.empathyScore);
  if (mod.completed && !mod.modal?.showStats) return 5;
  return 0;
}

export function hasPerfectStars(mod) {
  return starsForModule(mod) >= 5 && Boolean(mod.completed);
}

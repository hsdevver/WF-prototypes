/**
 * Shared consequence-flow graph (workflow-intro + flow-map).
 *
 *              m6 ──→ m8 ──→ m5
 *             ↗      ↗
 * m1 → m2 ───┤      │
 *             ↘      │
 *              m4 ───┘
 */

/** Path card label, e.g. "Chapter 3A". */
export function formatChapterLabel(chapter) {
  if (chapter == null || chapter === '') return '';
  const raw = String(chapter).trim();
  return /^chapter\b/i.test(raw) ? raw : `Chapter ${raw}`;
}

export function getChapterCardLabel(mod) {
  if (mod?.chapter != null && mod.chapter !== '') {
    return formatChapterLabel(mod.chapter);
  }
  return mod?.title ?? '';
}

/** Path card heading — "CHAPTER 1", "CHAPTER 3A", … */
export function getChapterCapsLabel(mod) {
  if (mod?.chapter == null || mod.chapter === '') return '';
  return `CHAPTER ${String(mod.chapter).trim()}`;
}

export function getChapterAriaLabel(mod) {
  const chapter = getChapterCardLabel(mod);
  const name = mod?.title?.trim();
  const locked = mod?.locked ? ' (locked)' : '';
  if (chapter && name && chapter !== name && !name.startsWith(chapter)) {
    return `${chapter}, ${name}${locked}`;
  }
  return `${chapter || name}${locked}`;
}

export const CONSEQUENCE_MODULES = [
  {
    id: 'm1',
    column: 1,
    row: 2,
    start: true,
    chapter: '1',
    title: 'Volume intro',
    description: 'Orientation — no scoring, sets context for the path ahead.',
    progress: 100,
    locked: false,
    hue: 210,
    modal: {
      badge: 'INTRO',
      cta: 'Play volume',
      showStats: false
    }
  },
  {
    id: 'm2',
    column: 2,
    row: 2,
    chapter: '2',
    title: 'First practice',
    description: 'First scored module; your result opens the up or down branch.',
    progress: 0,
    locked: true,
    hue: 205,
    modal: {
      badge: 'PRACTICE',
      cta: 'Play module',
      showStats: true,
      lastChoice: '—',
      playtime: '12 min',
      bestRun: '85%'
    }
  },
  {
    id: 'm4',
    column: 3,
    row: 3,
    chapter: '3B',
    title: 'Needs reinforcement',
    description: 'Unlocked when you struggle — lower consequence path.',
    progress: 0,
    locked: true,
    hue: 192
  },
  {
    id: 'm6',
    column: 3,
    row: 1,
    chapter: '3A',
    title: 'Upper lane',
    description: 'Strong outcome — continue straight or return to the hub.',
    progress: 0,
    locked: true,
    hue: 196,
    modal: {
      badge: 'PRACTICE',
      cta: 'Play module',
      showStats: true,
      lastChoice: '—',
      playtime: '12 min',
      bestRun: '85%'
    }
  },
  {
    id: 'm8',
    column: 4,
    row: 2,
    chapter: '4',
    title: 'Straight ahead',
    description: 'Merge point — both branches rejoin here before the final step.',
    progress: 0,
    locked: true,
    hue: 194
  },
  {
    id: 'm5',
    column: 5,
    row: 2,
    chapter: '5',
    title: 'Center check-in',
    description: 'Final step on the main lane after chapter 4.',
    progress: 0,
    locked: true,
    hue: 200
  }
];

export const CONSEQUENCE_EDGES = [
  ['m1', 'm2'],
  ['m2', 'm6'],
  ['m2', 'm4'],
  ['m6', 'm8'],
  ['m4', 'm8'],
  ['m8', 'm5']
];

/**
 * Cord attachment per edge (from → to), matched to layout sketches.
 * Only drawn when both modules are unlocked.
 */
export const CONSEQUENCE_CORD_ANCHORS = {
  'm1|m2': { from: 'right', to: 'left', slack: 1.06, sagSign: 1 },
  'm2|m6': { from: 'right', to: 'left', fromAlong: 0.32, toAlong: 0.28, slack: 1.14, sagSign: -1 },
  'm2|m4': { from: 'right', to: 'left', fromAlong: 0.68, toAlong: 0.72, slack: 1.14, sagSign: 1 },
  'm6|m8': { from: 'right', to: 'left', toAlong: 0.38, fromAlong: 0.5, slack: 1.08, sagSign: -1 },
  'm4|m8': { from: 'right', to: 'left', toAlong: 0.62, fromAlong: 0.5, slack: 1.08, sagSign: 1 },
  'm8|m5': { from: 'right', to: 'left', slack: 1.06, sagSign: 1 }
};

/** @typedef {{ id: string, label: string, plugWire?: boolean, direction?: 'up'|'down', hint?: string, unlocks: string[], fills: string[], lastChoice: string, result: string }} PlayOutcome */
/** @typedef {{ choicesPrompt: string, outcomes: PlayOutcome[] }} PlayScenario */

/** Simulated play — choice buttons in module modal unlock the next step(s). */
export const MODULE_PLAY_SCENARIOS = {
  m1: {
    choicesPrompt: 'How do you want to begin?',
    outcomes: [
      {
        id: 'orient',
        label: 'Take a moment to orient',
        plugWire: true,
        unlocks: ['m2'],
        fills: ['m1|m2'],
        lastChoice: 'Oriented first',
        result: 'First practice is now open on your path.'
      }
    ]
  },
  m2: {
    choicesPrompt: 'Which path does your result open?',
    outcomes: [
      {
        id: 'upper',
        label: 'Upper lane',
        hint: 'Strong outcome — continue up',
        direction: 'up',
        plugWire: true,
        unlocks: ['m6'],
        fills: ['m2|m6'],
        lastChoice: 'Upper lane',
        empathyScore: 80,
        result: 'Upper lane opens ahead on the straight path.'
      },
      {
        id: 'lower',
        label: 'Needs reinforcement',
        hint: 'Revisit fundamentals — path down',
        direction: 'down',
        plugWire: true,
        unlocks: ['m4'],
        fills: ['m2|m4'],
        lastChoice: 'Reinforcement',
        empathyScore: 80,
        result: 'The reinforcement path opens below.'
      }
    ]
  },
  m6: {
    choicesPrompt: 'Continue on the upper lane',
    outcomes: [
      {
        id: 'continue',
        label: 'Continue to chapter 4',
        hint: 'Rejoin the main path',
        plugWire: true,
        unlocks: ['m8'],
        fills: ['m6|m8'],
        lastChoice: 'Upper lane',
        empathyScore: 80,
        result: 'Chapter 4 opens on the merged path.'
      }
    ]
  },
  m8: {
    choicesPrompt: 'Continue on the main lane',
    outcomes: [
      {
        id: 'continue',
        label: 'Continue to chapter 5',
        plugWire: true,
        unlocks: ['m5'],
        fills: ['m8|m5'],
        lastChoice: 'Straight ahead',
        empathyScore: 52,
        result: 'Chapter 5 is now available.'
      }
    ]
  },
  m4: {
    choicesPrompt: 'Continue on the reinforcement path',
    outcomes: [
      {
        id: 'continue',
        label: 'Continue to chapter 4',
        hint: 'Rejoin the main path',
        plugWire: true,
        unlocks: ['m8'],
        fills: ['m4|m8'],
        lastChoice: 'Reinforcement',
        result: 'Chapter 4 opens on the merged path.'
      }
    ]
  },
  m5: {
    choicesPrompt: 'Clear the hub',
    outcomes: [
      {
        id: 'finish',
        label: 'Complete volume',
        lastChoice: 'Hub cleared',
        result: 'Getting started is complete.'
      }
    ]
  }
};

/** Chapter 1 is complete when the end cap module has been played. */
export const CHAPTER_1_END_MODULE_ID = 'm5';

/** Min stars on a module before its downstream unlocks / fills apply (prototype: m8 → m5). */
export const MODULE_STAR_UNLOCK_GATES = {
  m8: { minStars: 4, unlocks: ['m5'], fills: ['m8|m5'] }
};

/** Shorter linear path — Chapter 2: Almost a pro */
export const CHAPTER_2_MODULES = [
  {
    id: 'c2m1',
    column: 1,
    row: 1,
    start: true,
    chapter: '1',
    title: 'Warm-up drill',
    description: 'Quick calibration before the tighter pro lane.',
    progress: 100,
    locked: false,
    hue: 208,
    modal: { badge: 'DRILL', cta: 'Play module', showStats: false }
  },
  {
    id: 'c2m2',
    column: 2,
    row: 1,
    chapter: '2',
    title: 'Pro lane',
    description: 'Sharper pacing — your choices branch less here.',
    progress: 0,
    locked: true,
    hue: 202,
    modal: { badge: 'PRACTICE', cta: 'Play module', showStats: true }
  },
  {
    id: 'c2m3',
    column: 3,
    row: 1,
    chapter: '3',
    title: 'Almost there',
    description: 'Final check-in before the next milestone.',
    progress: 0,
    locked: true,
    hue: 198,
    modal: { badge: 'CHECK-IN', cta: 'Play module', showStats: true }
  }
];

export const CHAPTER_2_EDGES = [
  ['c2m1', 'c2m2'],
  ['c2m2', 'c2m3']
];

export const CHAPTER_2_CORD_ANCHORS = {
  'c2m1|c2m2': { from: 'right', to: 'left', slack: 1.05, sagSign: 1 },
  'c2m2|c2m3': { from: 'right', to: 'left', slack: 1.05, sagSign: -1 }
};

export const CHAPTER_2_PLAY_SCENARIOS = {
  c2m1: {
    choicesPrompt: 'How do you want to enter the pro lane?',
    outcomes: [
      {
        id: 'steady',
        label: 'Steady pace',
        plugWire: true,
        unlocks: ['c2m2'],
        fills: ['c2m1|c2m2'],
        lastChoice: 'Steady pace',
        result: 'Pro lane is open.'
      },
      {
        id: 'push',
        label: 'Push ahead',
        plugWire: true,
        unlocks: ['c2m2'],
        fills: ['c2m1|c2m2'],
        lastChoice: 'Push ahead',
        result: 'Pro lane is open.'
      }
    ]
  },
  c2m2: {
    choicesPrompt: 'Continue toward the check-in',
    outcomes: [
      {
        id: 'continue',
        label: 'Proceed to check-in',
        plugWire: true,
        unlocks: ['c2m3'],
        fills: ['c2m2|c2m3'],
        lastChoice: 'Pro lane',
        result: 'Almost there is unlocked.'
      }
    ]
  },
  c2m3: {
    choicesPrompt: 'Close out the volume',
    outcomes: [
      {
        id: 'done',
        label: 'Finish practice',
        lastChoice: 'Almost a pro',
        result: 'Volume complete.'
      }
    ]
  }
};

/**
 * Volume 3 — split → merge → branch column (3A / 3 / 3B) → converge → finish.
 * 3A and 3B share column 3 with chapter 3 (not column 4).
 */
export const CHAPTER_3_MODULES = [
  {
    id: 'c3m1',
    column: 1,
    row: 2,
    start: true,
    chapter: '1',
    title: 'Opening move',
    description: 'Entry point — your choice splits the path up and down.',
    progress: 100,
    locked: false,
    hue: 210,
    modal: { badge: 'INTRO', cta: 'Play module', showStats: false }
  },
  {
    id: 'c3m2a',
    column: 2,
    row: 1,
    chapter: '2A',
    title: 'Upper split',
    description: 'Strong lane — can feed the upper branch or merge early.',
    progress: 0,
    locked: true,
    hue: 206,
    modal: { badge: 'PRACTICE', cta: 'Play module', showStats: true }
  },
  {
    id: 'c3m2b',
    column: 2,
    row: 3,
    chapter: '2B',
    title: 'Lower split',
    description: 'Reinforcement lane — same fork, different consequence.',
    progress: 0,
    locked: true,
    hue: 202,
    modal: { badge: 'PRACTICE', cta: 'Play module', showStats: true }
  },
  {
    id: 'c3m3a',
    column: 3,
    row: 1,
    chapter: '3A',
    title: 'Upper branch',
    description: 'Paired with chapter 3 — carries the top lane forward.',
    progress: 0,
    locked: true,
    hue: 198,
    modal: { badge: 'PRACTICE', cta: 'Play module', showStats: true }
  },
  {
    id: 'c3m3',
    column: 3,
    row: 2,
    chapter: '3',
    title: 'Merge point',
    description: 'Both splits meet here before the branch column fans out.',
    progress: 0,
    locked: true,
    hue: 196,
    modal: { badge: 'PRACTICE', cta: 'Play module', showStats: true }
  },
  {
    id: 'c3m3b',
    column: 3,
    row: 3,
    chapter: '3B',
    title: 'Lower branch',
    description: 'Paired with chapter 3 — carries the lower lane forward.',
    progress: 0,
    locked: true,
    hue: 192,
    modal: { badge: 'PRACTICE', cta: 'Play module', showStats: true }
  },
  {
    id: 'c3m4',
    column: 4,
    row: 2,
    chapter: '4',
    title: 'Convergence',
    description: 'All three lanes from column 3 rejoin on the main spine.',
    progress: 0,
    locked: true,
    hue: 194,
    modal: { badge: 'PRACTICE', cta: 'Play module', showStats: true }
  },
  {
    id: 'c3m5',
    column: 5,
    row: 2,
    chapter: '5',
    title: 'Final gate',
    description: 'Last module on the advanced path.',
    progress: 0,
    locked: true,
    hue: 200,
    modal: { badge: 'CHECK-IN', cta: 'Play module', showStats: true }
  }
];

export const CHAPTER_3_EDGES = [
  ['c3m1', 'c3m2a'],
  ['c3m1', 'c3m2b'],
  ['c3m2a', 'c3m3a'],
  ['c3m2a', 'c3m3'],
  ['c3m2b', 'c3m3b'],
  ['c3m2b', 'c3m3'],
  ['c3m3', 'c3m4'],
  ['c3m3a', 'c3m4'],
  ['c3m3b', 'c3m4'],
  ['c3m4', 'c3m5']
];

export const CHAPTER_3_CORD_ANCHORS = {
  'c3m1|c3m2a': { from: 'right', to: 'left', fromAlong: 0.34, toAlong: 0.42, slack: 1.14, sagSign: -1 },
  'c3m1|c3m2b': { from: 'right', to: 'left', fromAlong: 0.66, toAlong: 0.58, slack: 1.14, sagSign: 1 },
  'c3m2a|c3m3a': { from: 'right', to: 'left', fromAlong: 0.44, toAlong: 0.3, slack: 1.1, sagSign: -1 },
  'c3m2a|c3m3': { from: 'right', to: 'left', fromAlong: 0.5, toAlong: 0.42, slack: 1.12, sagSign: -1 },
  'c3m2b|c3m3b': { from: 'right', to: 'left', fromAlong: 0.7, toAlong: 0.74, slack: 1.1, sagSign: 1 },
  'c3m2b|c3m3': { from: 'right', to: 'left', fromAlong: 0.36, toAlong: 0.56, slack: 1.12, sagSign: 1 },
  'c3m3|c3m4': { from: 'right', to: 'left', slack: 1.06, sagSign: 1 },
  'c3m3a|c3m4': { from: 'right', to: 'left', fromAlong: 0.5, toAlong: 0.36, slack: 1.1, sagSign: -1 },
  'c3m3b|c3m4': { from: 'right', to: 'left', fromAlong: 0.5, toAlong: 0.64, slack: 1.1, sagSign: 1 },
  'c3m4|c3m5': { from: 'right', to: 'left', slack: 1.06, sagSign: 1 }
};

export const CHAPTER_3_PLAY_SCENARIOS = {
  c3m1: {
    choicesPrompt: 'Which path does your choice open?',
    outcomes: [
      {
        id: 'upper',
        label: 'Upper split',
        hint: 'Strong outcome — continue up',
        direction: 'up',
        plugWire: true,
        unlocks: ['c3m2a'],
        fills: ['c3m1|c3m2a'],
        lastChoice: 'Upper split',
        empathyScore: 80,
        result: 'Upper lane opens ahead.'
      },
      {
        id: 'lower',
        label: 'Lower split',
        hint: 'Reinforcement lane — path down',
        direction: 'down',
        plugWire: true,
        unlocks: ['c3m2b'],
        fills: ['c3m1|c3m2b'],
        lastChoice: 'Lower split',
        empathyScore: 80,
        result: 'The lower lane opens below.'
      }
    ]
  },
  c3m2a: {
    choicesPrompt: 'From the upper split',
    outcomes: [
      {
        id: 'branch',
        label: 'Feed upper branch',
        direction: 'up',
        plugWire: true,
        unlocks: ['c3m3a'],
        fills: ['c3m2a|c3m3a'],
        lastChoice: 'Upper branch',
        empathyScore: 80,
        result: 'Chapter 3A opens above the merge.'
      },
      {
        id: 'merge',
        label: 'Merge early',
        hint: 'Join the center lane',
        plugWire: true,
        unlocks: ['c3m3'],
        fills: ['c3m2a|c3m3'],
        lastChoice: 'Early merge',
        empathyScore: 80,
        result: 'You join chapter 3 on the spine.'
      }
    ]
  },
  c3m2b: {
    choicesPrompt: 'From the lower split',
    outcomes: [
      {
        id: 'branch',
        label: 'Feed lower branch',
        direction: 'down',
        plugWire: true,
        unlocks: ['c3m3b'],
        fills: ['c3m2b|c3m3b'],
        lastChoice: 'Lower branch',
        empathyScore: 80,
        result: 'Chapter 3B opens below the merge.'
      },
      {
        id: 'merge',
        label: 'Merge early',
        hint: 'Join the center lane',
        plugWire: true,
        unlocks: ['c3m3'],
        fills: ['c3m2b|c3m3'],
        lastChoice: 'Early merge',
        empathyScore: 80,
        result: 'You join chapter 3 on the spine.'
      }
    ]
  },
  c3m3a: {
    choicesPrompt: 'Continue from the upper branch',
    outcomes: [
      {
        id: 'continue',
        label: 'Move to convergence',
        plugWire: true,
        unlocks: ['c3m4'],
        fills: ['c3m3a|c3m4'],
        lastChoice: 'Upper branch',
        result: 'Chapter 4 opens ahead.'
      }
    ]
  },
  c3m3: {
    choicesPrompt: 'Leave the merge point',
    outcomes: [
      {
        id: 'continue',
        label: 'Continue to convergence',
        plugWire: true,
        unlocks: ['c3m4'],
        fills: ['c3m3|c3m4'],
        lastChoice: 'Merge point',
        result: 'Chapter 4 opens ahead.'
      }
    ]
  },
  c3m3b: {
    choicesPrompt: 'Continue from the lower branch',
    outcomes: [
      {
        id: 'continue',
        label: 'Move to convergence',
        plugWire: true,
        unlocks: ['c3m4'],
        fills: ['c3m3b|c3m4'],
        lastChoice: 'Lower branch',
        result: 'Chapter 4 opens ahead.'
      }
    ]
  },
  c3m4: {
    choicesPrompt: 'Clear convergence',
    outcomes: [
      {
        id: 'continue',
        label: 'Continue to final gate',
        plugWire: true,
        unlocks: ['c3m5'],
        fills: ['c3m4|c3m5'],
        lastChoice: 'Convergence',
        result: 'Final gate is available.'
      }
    ]
  },
  c3m5: {
    choicesPrompt: 'Close the volume',
    outcomes: [
      {
        id: 'finish',
        label: 'Complete volume',
        lastChoice: 'Final gate',
        result: 'Volume 3 complete.'
      }
    ]
  }
};

export const CHAPTER_2_END_MODULE_ID = 'c2m3';
export const CHAPTER_3_END_MODULE_ID = 'c3m5';

/**
 * Distinct upstream routes into hub / final modules (for path-hover picker).
 * `along` is 0–1 band on the target card for pointer selection (top → bottom).
 */
export const PATH_ROUTE_VARIANTS = {
  m5: [
    {
      id: 'via-upper',
      along: 0.28,
      label: '2A · 4',
      edges: ['m1|m2', 'm2|m6', 'm6|m8', 'm8|m5']
    },
    {
      id: 'via-lower',
      along: 0.72,
      label: '2B · 4',
      edges: ['m1|m2', 'm2|m4', 'm4|m8', 'm8|m5']
    }
  ],
  c3m5: [
    {
      id: 'via-2a-3a',
      along: 0.12,
      label: '2A · 3A · 4',
      edges: ['c3m1|c3m2a', 'c3m2a|c3m3a', 'c3m3a|c3m4', 'c3m4|c3m5']
    },
    {
      id: 'via-2a-3',
      along: 0.37,
      label: '2A · 3 · 4',
      edges: ['c3m1|c3m2a', 'c3m2a|c3m3', 'c3m3|c3m4', 'c3m4|c3m5']
    },
    {
      id: 'via-2b-3b',
      along: 0.63,
      label: '2B · 3B · 4',
      edges: ['c3m1|c3m2b', 'c3m2b|c3m3b', 'c3m3b|c3m4', 'c3m4|c3m5']
    },
    {
      id: 'via-2b-3',
      along: 0.88,
      label: '2B · 3 · 4',
      edges: ['c3m1|c3m2b', 'c3m2b|c3m3', 'c3m3|c3m4', 'c3m4|c3m5']
    }
  ]
};

/** @param {string} moduleId */
export function getPathRouteVariants(moduleId) {
  return PATH_ROUTE_VARIANTS[moduleId] ?? null;
}

export function getChapterGraph(chapter) {
  if (chapter === 2) {
    return {
      modules: CHAPTER_2_MODULES,
      edges: CHAPTER_2_EDGES,
      cordAnchors: CHAPTER_2_CORD_ANCHORS,
      scenarios: CHAPTER_2_PLAY_SCENARIOS
    };
  }
  if (chapter === 3) {
    return {
      modules: CHAPTER_3_MODULES,
      edges: CHAPTER_3_EDGES,
      cordAnchors: CHAPTER_3_CORD_ANCHORS,
      scenarios: CHAPTER_3_PLAY_SCENARIOS
    };
  }
  return {
    modules: CONSEQUENCE_MODULES,
    edges: CONSEQUENCE_EDGES,
    cordAnchors: CONSEQUENCE_CORD_ANCHORS,
    scenarios: MODULE_PLAY_SCENARIOS
  };
}

/** @deprecated — use consequence-progress session state */
export const CONSEQUENCE_FILLED_EDGE_KEYS = [];

export const CONSEQUENCE_PLAY_ORDER = ['m1', 'm2', 'm4', 'm6', 'm8', 'm5'];

/** Primary skill each module contributes to the player profile aggregate. */
export const MODULE_SKILL_FOCUS = {
  m1: 'communication',
  m2: 'empathy',
  m4: 'ownership',
  m6: 'empathy',
  m8: 'communication',
  m5: 'ownership',
  c2m1: 'communication',
  c2m2: 'empathy',
  c2m3: 'ownership',
  c3m1: 'communication',
  c3m2a: 'empathy',
  c3m2b: 'ownership',
  c3m3a: 'empathy',
  c3m3: 'communication',
  c3m3b: 'ownership',
  c3m4: 'empathy',
  c3m5: 'ownership'
};

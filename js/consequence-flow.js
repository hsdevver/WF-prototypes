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

export function getChapterGraph(chapter) {
  if (chapter === 2) {
    return {
      modules: CHAPTER_2_MODULES,
      edges: CHAPTER_2_EDGES,
      cordAnchors: CHAPTER_2_CORD_ANCHORS,
      scenarios: CHAPTER_2_PLAY_SCENARIOS
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
  c2m3: 'ownership'
};

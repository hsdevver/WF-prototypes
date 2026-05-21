export const STORAGE_HOVER_SOUND = 'wf-proto-hover-sound';
export const STORAGE_HOVER_SOUND_MODE = 'wf-proto-hover-sound-mode';
export const STORAGE_HOVER_SOUND_PINNED = 'wf-proto-hover-sound-pinned';

export const HOVER_SOUND_CATEGORIES = [
  { id: 'off', label: 'Off' },
  { id: 'synth', label: 'Synth' },
  { id: 'drop', label: 'Drop' },
  { id: 'click', label: 'Click' },
  { id: 'forceField', label: 'Force field' },
  { id: 'lowFrequency', label: 'Low freq' },
  { id: 'glass', label: 'Glass' },
  { id: 'glitch', label: 'Glitch' }
];

/** Files in /assets — matched by category id appearing in the filename. */
export const HOVER_SOUND_MANIFEST = {
  drop: ['drop_001.ogg', 'drop_002.ogg', 'drop_003.ogg', 'drop_004.ogg'],
  click: ['click_003.ogg'],
  forceField: ['forceField_000.ogg', 'forceField_001.ogg'],
  lowFrequency: ['lowFrequency_explosion_000.ogg', 'lowFrequency_explosion_001.ogg'],
  glass: ['glass_001.ogg', 'glass_002.ogg', 'glass_003.ogg', 'glass_005.ogg', 'glass_006.ogg'],
  glitch: ['glitch_001.ogg', 'glitch_002.ogg', 'glitch_003.ogg', 'glitch_004.ogg']
};

let audioCtx = null;
let hoverAudioEl = null;
let unlocked = false;
let lastPlayAt = 0;
const MIN_INTERVAL_MS = 70;
const HOVER_VOLUME = 0.42;
const LOCKED_REJECT_VOLUME = 0.5;
/** Matches workflow-intro.css --stagger-module */
export const MODULE_REVEAL_STAGGER_MS = 320;

function assetsBaseUrl() {
  const path = window.location.pathname;
  if (/\/(workflow-intro|flow-map)\//.test(path)) return '../assets/';
  return 'assets/';
}

export function getHoverSoundCategory() {
  return localStorage.getItem(STORAGE_HOVER_SOUND) || 'click';
}

export function getHoverSoundMode() {
  const mode = localStorage.getItem(STORAGE_HOVER_SOUND_MODE);
  return mode === 'single' ? 'single' : 'random';
}

function getPinnedFiles() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_HOVER_SOUND_PINNED) || '{}');
  } catch {
    return {};
  }
}

function setPinnedFile(category, filename) {
  const pins = getPinnedFiles();
  pins[category] = filename;
  localStorage.setItem(STORAGE_HOVER_SOUND_PINNED, JSON.stringify(pins));
}

function ensurePinForCategory(category) {
  const files = HOVER_SOUND_MANIFEST[category];
  if (!files?.length) return;

  const pins = getPinnedFiles();
  if (pins[category] && files.includes(pins[category])) return;

  setPinnedFile(category, files[0]);
}

function ensurePinsForAllCategories() {
  for (const category of Object.keys(HOVER_SOUND_MANIFEST)) {
    ensurePinForCategory(category);
  }
}

function broadcastHoverSoundSettings() {
  const payload = {
    type: 'wf-hover-sound',
    category: getHoverSoundCategory(),
    mode: getHoverSoundMode()
  };
  window.dispatchEvent(new CustomEvent('wf-hover-sound-change', { detail: payload }));

  document.querySelectorAll('iframe').forEach((frame) => {
    try {
      frame.contentWindow?.postMessage(payload, '*');
    } catch {
      /* ignore */
    }
  });
}

export function setHoverSoundCategory(category) {
  const valid = HOVER_SOUND_CATEGORIES.some((c) => c.id === category);
  const id = valid ? category : 'click';
  localStorage.setItem(STORAGE_HOVER_SOUND, id);

  if (getHoverSoundMode() === 'single' && HOVER_SOUND_MANIFEST[id]) {
    ensurePinForCategory(id);
  }

  broadcastHoverSoundSettings();
  return id;
}

export function setHoverSoundMode(mode) {
  const id = mode === 'single' ? 'single' : 'random';
  localStorage.setItem(STORAGE_HOVER_SOUND_MODE, id);
  if (id === 'single') ensurePinsForAllCategories();
  broadcastHoverSoundSettings();
  return id;
}

function prefersReducedFeedback() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

export function unlockUiSounds() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  unlocked = true;
}

async function ensureSoundsReady() {
  unlockUiSounds();
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
}

function pickFileForCategory(category) {
  const files = HOVER_SOUND_MANIFEST[category];
  if (!files?.length) return null;

  if (getHoverSoundMode() === 'single') {
    ensurePinForCategory(category);
    return getPinnedFiles()[category] ?? files[0];
  }

  return files[Math.floor(Math.random() * files.length)];
}

function playAssetSound(filename, volume = HOVER_VOLUME) {
  const url = `${assetsBaseUrl()}${filename}`;
  if (!hoverAudioEl) hoverAudioEl = new Audio();
  hoverAudioEl.pause();
  hoverAudioEl.volume = volume;
  hoverAudioEl.src = url;
  hoverAudioEl.currentTime = 0;
  hoverAudioEl.play().then(() => {
    unlocked = true;
  }).catch(() => {});
}

function playAssetHoverSound(filename) {
  playAssetSound(filename, HOVER_VOLUME);
}

function pickForceFieldFile() {
  const files = HOVER_SOUND_MANIFEST.forceField;
  if (!files?.length) return null;
  if (getHoverSoundMode() === 'single') {
    ensurePinForCategory('forceField');
    return getPinnedFiles().forceField ?? files[0];
  }
  return files[Math.floor(Math.random() * files.length)];
}

/** Locked module tap — always force-field, independent of hover sound setting. */
export async function playLockedModuleForceField() {
  if (prefersReducedFeedback()) return;

  await ensureSoundsReady();

  const now = performance.now();
  if (now - lastPlayAt < MIN_INTERVAL_MS) return;
  lastPlayAt = now;

  const file = pickForceFieldFile();
  if (file) playAssetSound(file, LOCKED_REJECT_VOLUME);
}

/** Synthesized mechanical key / button press (~45ms). */
function playSyntheticClick() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.24;
  master.connect(ctx.destination);

  const bufferSize = Math.floor(ctx.sampleRate * 0.038);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const env = 1 - i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * env * env;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 2600;
  bandpass.Q.value = 1.1;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.4, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.036);

  noise.connect(bandpass).connect(noiseGain).connect(master);
  noise.start(t);
  noise.stop(t + 0.04);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(110, t + 0.028);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.18, t);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.042);

  osc.connect(oscGain).connect(master);
  osc.start(t);
  osc.stop(t + 0.048);
}

export async function playModuleHoverClick({ bypassThrottle = false } = {}) {
  if (prefersReducedFeedback()) return;

  await ensureSoundsReady();

  const category = getHoverSoundCategory();
  if (category === 'off') return;

  const now = performance.now();
  if (!bypassThrottle && now - lastPlayAt < MIN_INTERVAL_MS) return;
  lastPlayAt = now;

  if (category === 'synth') {
    const ctx = getAudioContext();
    if (ctx?.state === 'running') playSyntheticClick();
    return;
  }

  const file = pickFileForCategory(category);
  if (file) {
    playAssetHoverSound(file);
    return;
  }

  const ctx = getAudioContext();
  if (ctx?.state === 'running') playSyntheticClick();
}

/** Staggered pops when intro module cards appear (workflow-intro). */
export function scheduleModuleRevealSounds(count, staggerMs = MODULE_REVEAL_STAGGER_MS) {
  for (let i = 0; i < count; i++) {
    window.setTimeout(() => {
      playModuleHoverClick({ bypassThrottle: true });
    }, i * staggerMs);
  }
}

function triggerModuleHoverPop(card) {
  card.classList.remove('is-hover-pop');
  void card.offsetWidth;
  card.classList.add('is-hover-pop');
}

function onCardPointerOver(event) {
  if (event.pointerType === 'touch') return;

  const card = event.target.closest('.module-card:not(.locked)');
  if (!card) return;

  const from = event.relatedTarget;
  if (from && card.contains(from)) return;

  triggerModuleHoverPop(card);
  playModuleHoverClick();
}

function onCardPointerOut(event) {
  const card = event.target.closest('.module-card:not(.locked)');
  if (!card) return;

  const to = event.relatedTarget;
  if (to && card.contains(to)) return;

  card.classList.remove('is-hover-pop');
}

let lockedPressCard = null;

function releaseLockedPress() {
  if (!lockedPressCard) return;
  lockedPressCard.classList.remove('is-locked-press');
  lockedPressCard = null;
}

function onLockedCardPointerDown(event) {
  if (event.button !== 0) return;

  const card = event.target.closest('.module-card.locked');
  if (!card) return;

  releaseLockedPress();
  lockedPressCard = card;
  card.classList.add('is-locked-press');
  playLockedModuleForceField();

  try {
    card.setPointerCapture(event.pointerId);
  } catch {
    /* ignore */
  }
}

function onLockedCardRelease() {
  releaseLockedPress();
}

/** Keyboard activate (Space/Enter) — mouse uses pointerdown. */
function onLockedCardClick(event) {
  const card = event.target.closest('.module-card.locked');
  if (!card || event.detail !== 0) return;

  card.classList.add('is-locked-press');
  playLockedModuleForceField();
  window.setTimeout(() => card.classList.remove('is-locked-press'), 160);
}

export function initHoverSoundSync() {
  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'wf-hover-sound') return;
    if (event.data.category) localStorage.setItem(STORAGE_HOVER_SOUND, event.data.category);
    if (event.data.mode) localStorage.setItem(STORAGE_HOVER_SOUND_MODE, event.data.mode);
  });

  window.addEventListener('storage', (event) => {
    if (
      event.key === STORAGE_HOVER_SOUND ||
      event.key === STORAGE_HOVER_SOUND_MODE ||
      event.key === STORAGE_HOVER_SOUND_PINNED
    ) {
      broadcastHoverSoundSettings();
    }
  });
}

function wireSoundUnlock() {
  const unlock = () => unlockUiSounds();
  const opts = { passive: true };
  document.addEventListener('pointerdown', unlock, opts);
  document.addEventListener('keydown', unlock, opts);
  document.addEventListener('touchstart', unlock, opts);
  document.addEventListener('mousemove', unlock, { passive: true, once: true });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) ensureSoundsReady();
  });
}

export function initModuleCardSounds(root = document) {
  initHoverSoundSync();
  wireSoundUnlock();

  root.addEventListener('pointerover', onCardPointerOver);
  root.addEventListener('pointerout', onCardPointerOut);
  root.addEventListener('pointerdown', onLockedCardPointerDown);
  root.addEventListener('pointerup', onLockedCardRelease);
  root.addEventListener('pointercancel', onLockedCardRelease);
  root.addEventListener('click', onLockedCardClick);
}

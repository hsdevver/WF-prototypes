import { unlockUiSounds } from './ui-sounds.js';

export const STORAGE_MUSIC_MUTED = 'wf-proto-music-muted';
export const STORAGE_MUSIC_VOLUME = 'wf-proto-music-volume';

const SPACE_PLAYLIST = ['p1.mov', 'p2.mov', 'p3.mov', 'p4.mov', 'p5.mov'];
const CORPORATE_TRACK = 'office ambient.mp3';
const MASTER_VOLUME = 0.5;
const CORPORATE_VOLUME = 0.42;
const TAIL_FADE_SEC = 3;
const TAIL_INDEX = 4;
const RMS_WINDOW_SEC = 0.4;

let audioCtx = null;
let masterGain = null;
let spaceBuffers = null;
let corporateBuffer = null;
let corporateSource = null;
let sequenceGen = 0;
let ambientStarted = false;
let activeMode = null;
let spaceLoadPromise = null;
let corporateLoadPromise = null;
let applyingAmbient = false;

function assetsBaseUrl() {
  const path = window.location.pathname;
  if (/\/(workflow-intro|flow-map)\//.test(path)) return '../assets/';
  return 'assets/';
}

function getAmbientMode() {
  return document.documentElement.dataset.skin === 'corporate' ? 'corporate' : 'space';
}

function rmsAt(buffer, startSec, durationSec) {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const start = Math.max(0, Math.floor(startSec * sr));
  const end = Math.min(data.length, Math.floor((startSec + durationSec) * sr));
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / (end - start));
}

async function ensureAudioContext() {
  if (audioCtx && masterGain) return;

  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('Web Audio not supported');

  audioCtx = new Ctx();
  masterGain = audioCtx.createGain();
  masterGain.connect(audioCtx.destination);
}

function baseVolumeForMode(mode) {
  return mode === 'corporate' ? CORPORATE_VOLUME : MASTER_VOLUME;
}

function applyMasterGain() {
  if (!masterGain) return;
  const mode = activeMode ?? getAmbientMode();
  const scale = isMusicMuted() ? 0 : getMusicVolume();
  masterGain.gain.value = baseVolumeForMode(mode) * scale;
}

function setMasterVolumeForMode(mode) {
  activeMode = activeMode ?? mode;
  applyMasterGain();
}

export function getMusicVolume() {
  const raw = localStorage.getItem(STORAGE_MUSIC_VOLUME);
  if (raw == null || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

/** @param {number} level 0–1 */
export function setMusicVolume(level) {
  const v = Math.max(0, Math.min(1, Number(level)));
  localStorage.setItem(STORAGE_MUSIC_VOLUME, String(v));
  applyMasterGain();
  dispatchMusicChange();
}

function dispatchMusicChange() {
  const payload = {
    type: 'wf-music',
    muted: isMusicMuted(),
    volume: getMusicVolume()
  };
  window.dispatchEvent(new CustomEvent('wf-music-change', { detail: payload }));
  document.querySelectorAll('iframe').forEach((frame) => {
    try {
      frame.contentWindow?.postMessage(payload, '*');
    } catch {
      /* ignore */
    }
  });
}

async function ensureSpaceAudioReady() {
  await ensureAudioContext();
  if (spaceBuffers) return spaceBuffers;

  if (!spaceLoadPromise) {
    spaceLoadPromise = (async () => {
      const base = assetsBaseUrl();
      const decoded = [];
      for (const file of SPACE_PLAYLIST) {
        const res = await fetch(`${base}${file}`);
        if (!res.ok) throw new Error(`Failed to load ${file}`);
        const arr = await res.arrayBuffer();
        decoded.push(await audioCtx.decodeAudioData(arr.slice(0)));
      }
      spaceBuffers = decoded;
      return spaceBuffers;
    })();
  }

  return spaceLoadPromise;
}

async function ensureCorporateAudioReady() {
  await ensureAudioContext();
  if (corporateBuffer) return corporateBuffer;

  if (!corporateLoadPromise) {
    corporateLoadPromise = (async () => {
      const base = assetsBaseUrl();
      const res = await fetch(`${base}${encodeURIComponent(CORPORATE_TRACK)}`);
      if (!res.ok) throw new Error(`Failed to load ${CORPORATE_TRACK}`);
      const arr = await res.arrayBuffer();
      corporateBuffer = await audioCtx.decodeAudioData(arr.slice(0));
      return corporateBuffer;
    })();
  }

  return corporateLoadPromise;
}

function stopCorporateLoop() {
  if (!corporateSource) return;
  try {
    corporateSource.stop();
  } catch {
    /* already stopped */
  }
  corporateSource.disconnect();
  corporateSource = null;
}

function stopSequence() {
  sequenceGen += 1;
  stopCorporateLoop();
  if (audioCtx?.state === 'running') {
    audioCtx.suspend().catch(() => {});
  }
}

async function resumeContext() {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') await audioCtx.resume();
}

function playBufferSimple(index, gen, when, onEnded) {
  const src = audioCtx.createBufferSource();
  src.buffer = spaceBuffers[index];
  src.connect(masterGain);
  src.onended = () => {
    if (gen !== sequenceGen || isMusicMuted() || activeMode !== 'space') return;
    onEnded?.();
  };
  src.start(when);
  return src;
}

/** p5 tail fades (“sizzle”) to match p1 head level, then crossfades into p1. */
function scheduleP5IntoP1(gen, when) {
  const tail = spaceBuffers[TAIL_INDEX];
  const p1 = spaceBuffers[0];
  const tailDur = tail.duration;
  const fade = Math.min(TAIL_FADE_SEC, tailDur * 0.5);
  const fadeStart = Math.max(0, tailDur - fade);

  const p1StartRms = rmsAt(p1, 0, RMS_WINDOW_SEC);
  const tailEndRms = rmsAt(tail, Math.max(0, tailDur - RMS_WINDOW_SEC), RMS_WINDOW_SEC);
  const tailLevelMatch = tailEndRms > 0.0001 ? Math.min(1.2, p1StartRms / tailEndRms) : 1;

  const tailSrc = audioCtx.createBufferSource();
  tailSrc.buffer = tail;
  const tailGain = audioCtx.createGain();
  tailSrc.connect(tailGain).connect(masterGain);

  tailGain.gain.setValueAtTime(1, when);
  tailGain.gain.setValueAtTime(1, when + fadeStart);

  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const time = when + fadeStart + t * fade;
    const tailCurve = Math.cos((t * Math.PI) / 2);
    const sizzle = 1 - t * 0.15;
    const gTail = Math.max(0.0001, tailCurve * sizzle * (i === steps ? tailLevelMatch * 0.25 : 1));
    tailGain.gain.linearRampToValueAtTime(gTail, time);
  }
  tailGain.gain.linearRampToValueAtTime(0.0001, when + tailDur);

  const p1Src = audioCtx.createBufferSource();
  p1Src.buffer = p1;
  const p1Gain = audioCtx.createGain();
  p1Src.connect(p1Gain).connect(masterGain);

  p1Gain.gain.setValueAtTime(0.0001, when + fadeStart);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const time = when + fadeStart + t * fade;
    const g1 = Math.max(0.0001, Math.sin((t * Math.PI) / 2));
    p1Gain.gain.linearRampToValueAtTime(g1, time);
  }
  p1Gain.gain.setValueAtTime(1, when + fadeStart + fade + 0.05);

  tailSrc.start(when);
  tailSrc.stop(when + tailDur + 0.01);
  p1Src.start(when + fadeStart);

  p1Src.onended = () => {
    if (gen !== sequenceGen || isMusicMuted() || activeMode !== 'space') return;
    chainMiddleTracks(gen);
  };
}

function chainMiddleTracks(gen) {
  const t1 = audioCtx.currentTime + 0.02;
  playBufferSimple(1, gen, t1, () => {
    if (gen !== sequenceGen || isMusicMuted() || activeMode !== 'space') return;
    const t2 = audioCtx.currentTime + 0.02;
    playBufferSimple(2, gen, t2, () => {
      if (gen !== sequenceGen || isMusicMuted() || activeMode !== 'space') return;
      const t3 = audioCtx.currentTime + 0.02;
      playBufferSimple(3, gen, t3, () => {
        if (gen !== sequenceGen || isMusicMuted() || activeMode !== 'space') return;
        const t4 = audioCtx.currentTime + 0.02;
        scheduleP5IntoP1(gen, t4);
      });
    });
  });
}

function startSpacePlaylistLoop(gen) {
  if (gen !== sequenceGen || isMusicMuted() || activeMode !== 'space' || !spaceBuffers?.length) {
    return;
  }

  const when = audioCtx.currentTime + 0.05;
  playBufferSimple(0, gen, when, () => {
    if (gen !== sequenceGen || isMusicMuted() || activeMode !== 'space') return;
    chainMiddleTracks(gen);
  });
}

function startCorporateLoop(gen) {
  if (gen !== sequenceGen || isMusicMuted() || activeMode !== 'corporate' || !corporateBuffer) {
    return;
  }

  stopCorporateLoop();
  const src = audioCtx.createBufferSource();
  src.buffer = corporateBuffer;
  src.loop = true;
  src.connect(masterGain);
  corporateSource = src;
  src.start(audioCtx.currentTime + 0.02);
}

async function startAmbientForMode(mode) {
  activeMode = mode;
  setMasterVolumeForMode(mode);
  sequenceGen += 1;
  const gen = sequenceGen;

  await resumeContext();

  if (mode === 'corporate') {
    await ensureCorporateAudioReady();
    startCorporateLoop(gen);
    return;
  }

  await ensureSpaceAudioReady();
  startSpacePlaylistLoop(gen);
}

export function isMusicMuted() {
  return localStorage.getItem(STORAGE_MUSIC_MUTED) === 'true';
}

export function setMusicMuted(muted) {
  localStorage.setItem(STORAGE_MUSIC_MUTED, muted ? 'true' : 'false');
  applyAmbientMusic();
}

export function getMusicVolumePercent() {
  return Math.round(getMusicVolume() * 100);
}

export async function applyAmbientMusic() {
  if (applyingAmbient) return isMusicMuted();
  applyingAmbient = true;
  try {
    const muted = isMusicMuted();
    const mode = getAmbientMode();

    document.documentElement.dataset.musicMuted = muted ? 'true' : 'false';

    if (muted) {
      stopSequence();
      activeMode = null;
      applyMasterGain();
    } else if (ambientStarted) {
      const modeChanged = activeMode !== mode;
      if (modeChanged) {
        stopSequence();
        await startAmbientForMode(mode);
      } else {
        await resumeContext();
        applyMasterGain();
        if (mode === 'corporate' && !corporateSource) {
          sequenceGen += 1;
          startCorporateLoop(sequenceGen);
        }
      }
    }

    dispatchMusicChange();
    return muted;
  } finally {
    applyingAmbient = false;
  }
}

export function initAmbientMusicSync() {
  applyAmbientMusic();

  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'wf-music') return;
    localStorage.setItem(STORAGE_MUSIC_MUTED, event.data.muted ? 'true' : 'false');
    if (typeof event.data.volume === 'number') {
      localStorage.setItem(STORAGE_MUSIC_VOLUME, String(Math.max(0, Math.min(1, event.data.volume))));
    }
    applyAmbientMusic();
  });

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_MUSIC_MUTED || event.key === STORAGE_MUSIC_VOLUME) applyAmbientMusic();
  });

  window.addEventListener('wf-theme-change', () => {
    if (!ambientStarted || isMusicMuted()) return;
    applyAmbientMusic();
  });
}

export function initAmbientPlayback() {
  applyAmbientMusic();

  const start = async () => {
    if (ambientStarted || isMusicMuted()) return;
    try {
      unlockUiSounds();
      ambientStarted = true;
      await startAmbientForMode(getAmbientMode());
      document.removeEventListener('pointerdown', start);
      document.removeEventListener('keydown', start);
    } catch (err) {
      console.warn('Ambient playback failed to start:', err);
    }
  };

  start();
  document.addEventListener('pointerdown', start);
  document.addEventListener('keydown', start);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopSequence();
    } else if (ambientStarted && !isMusicMuted()) {
      startAmbientForMode(getAmbientMode());
    }
  });

  window.addEventListener('wf-music-change', () => {
    applyAmbientMusic();
  });
}

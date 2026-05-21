import {
  CONSEQUENCE_EDGES as EDGES,
  CONSEQUENCE_PLAY_ORDER as PLAY_ORDER,
  getChapterAriaLabel
} from './consequence-flow.js';
import { starsForModule } from './empathy-score.js';
import { getRuntimeModules, isEdgeFilled } from './consequence-progress.js';
import { applyFolderChrome, createModuleThumbLabel, syncModuleThumbLabel } from './module-layout.js';

const START_ID = 'm1';

const viewport = document.getElementById('viewport');
const stage = document.getElementById('stage');
const map = document.getElementById('map');
const gridEl = document.getElementById('columns');
const connectorsEl = document.getElementById('connectors');

let camera = { x: 0, y: 0, scale: 0.85 };
let isPanning = false;
let panStart = { x: 0, y: 0, camX: 0, camY: 0 };
let focusId = START_ID;
let dimOthers = false;

function edgeKey(a, b) {
  return `${a}|${b}`;
}

const STAR_SVG =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M6 1.2 7.47 4.18l3.29.48-2.38 2.32.56 3.27L6 8.3l-2.94 1.55.56-3.27-2.38-2.32 3.29-.48z"/></svg>';

const PADLOCK_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="lock-shackle" fill="none" stroke="currentColor" stroke-width="2" d="M8 11V8a4 4 0 0 1 8 0v3"/><rect class="lock-body" fill="currentColor" x="5" y="11" width="14" height="9" rx="2"/></svg>';

function imageUrlFor(mod) {
  return `https://picsum.photos/seed/wf-${mod.id}/400/320`;
}

function renderStars(count) {
  const el = document.createElement('div');
  el.className = 'module-stars';
  el.setAttribute('aria-hidden', count ? 'false' : 'true');
  if (count) el.setAttribute('aria-label', `${count} of 5 stars`);
  for (let i = 0; i < 5; i++) {
    const star = document.createElement('span');
    star.className = `module-star${i < count ? ' is-filled' : ''}`;
    star.innerHTML = STAR_SVG;
    el.appendChild(star);
  }
  return el;
}

/**
 * Orthogonal “subway” path with rounded corners — matches IMPACT / Figma
 * materiaa subway: horizontal lanes, vertical joins, soft elbows.
 */
function connectorPath(fromX, fromY, toX, toY, laneGap = 28, radius = 18) {
  if (Math.abs(fromY - toY) < 1) {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }

  const dirX = toX >= fromX ? 1 : -1;
  const exitX = fromX + dirX * laneGap;
  const entryX = toX - dirX * laneGap;
  const midX = (exitX + entryX) / 2;

  const dy = toY - fromY;
  const sy = dy >= 0 ? 1 : -1;
  const ey = toX >= midX ? 1 : -1;

  const r = Math.min(
    radius,
    Math.abs(midX - fromX) * 0.45,
    Math.abs(midX - exitX),
    Math.abs(dy) * 0.45,
    Math.abs(toX - entryX) * 0.45
  );

  if (r < 3) {
    return `M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`;
  }

  return [
    `M ${fromX} ${fromY}`,
    `H ${midX - dirX * r}`,
    `Q ${midX} ${fromY} ${midX} ${fromY + sy * r}`,
    `V ${toY - sy * r}`,
    `Q ${midX} ${toY} ${midX + ey * r} ${toY}`,
    `H ${toX}`
  ].join(' ');
}

function getNodeAnchor(nodeEl, side) {
  let x = 0;
  let y = 0;
  let el = nodeEl;
  while (el && el !== map) {
    x += el.offsetLeft;
    y += el.offsetTop;
    el = el.offsetParent;
  }
  if (side === 'right') {
    x += nodeEl.offsetWidth;
  }
  y += nodeEl.offsetHeight / 2;
  return { x, y };
}

function renderModules() {
  gridEl.className = 'path-grid';
  gridEl.innerHTML = '';

  for (const mod of getRuntimeModules()) {
    const wrap = document.createElement('div');
    wrap.className = 'node-wrap';
    wrap.dataset.moduleAnchor = mod.id;
    wrap.style.gridColumn = String(mod.column);
    wrap.style.gridRow = String(mod.row);
    if (dimOthers && mod.id !== focusId) wrap.classList.add('dimmed');
    if (mod.start) wrap.classList.add('node-wrap--start');
    if (mod.id === 'm5') wrap.classList.add('node-wrap--hub');

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'module-card';
    card.dataset.moduleId = mod.id;
    card.title = getChapterAriaLabel(mod).replace(/ \(locked\)$/, '');
    card.setAttribute('aria-label', getChapterAriaLabel(mod));
    if (mod.locked) card.classList.add('locked');
    if (mod.start) card.classList.add('module-card--start');
    if (mod.id === focusId) card.classList.add('focus-ring');

    const thumb = document.createElement('div');
    thumb.className = 'module-thumb';

    const img = document.createElement('img');
    img.className = 'module-thumb__img';
    img.src = imageUrlFor(mod);
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';

    const overlay = document.createElement('div');
    overlay.className = 'module-thumb__overlay';
    overlay.setAttribute('aria-hidden', 'true');

    thumb.append(img, overlay, createModuleThumbLabel(mod));

    if (mod.locked) {
      const lock = document.createElement('div');
      lock.className = 'module-padlock';
      lock.innerHTML = PADLOCK_SVG;
      thumb.appendChild(lock);
    } else {
      thumb.appendChild(renderStars(starsForModule(mod)));
    }

    card.append(thumb);
    applyFolderChrome(card, mod);
    card.addEventListener('click', () => setFocus(mod.id));
    wrap.appendChild(card);
    gridEl.appendChild(wrap);
  }
}

function measureConnectors() {
  let maxX = 0;
  let maxY = 0;
  const segments = [];

  for (const [fromId, toId] of EDGES) {
    const fromEl = map.querySelector(`[data-module-anchor="${fromId}"]`);
    const toEl = map.querySelector(`[data-module-anchor="${toId}"]`);
    if (!fromEl || !toEl) continue;

    const from = getNodeAnchor(fromEl, 'right');
    const to = getNodeAnchor(toEl, 'left');
    const d = connectorPath(from.x, from.y, to.x, to.y);

    maxX = Math.max(maxX, from.x, to.x);
    maxY = Math.max(maxY, from.y, to.y);
    segments.push({ fromId, toId, d });
  }

  const w = Math.max(maxX + 120, map.offsetWidth);
  const h = Math.max(maxY + 120, map.offsetHeight);
  connectorsEl.setAttribute('width', String(w));
  connectorsEl.setAttribute('height', String(h));
  connectorsEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
  connectorsEl.innerHTML = '';

  for (const seg of segments) {
    const key = edgeKey(seg.fromId, seg.toId);
    const filled = isEdgeFilled(key);

    const track = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    track.setAttribute('d', seg.d);
    track.setAttribute('class', 'lane-track');

    const fill = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    fill.setAttribute('d', seg.d);
    fill.setAttribute('class', `lane-fill${filled ? ' filled' : ''}`);

    connectorsEl.append(track, fill);
  }

  requestAnimationFrame(() => {
    const tracks = connectorsEl.querySelectorAll('path.lane-track');
    const fills = connectorsEl.querySelectorAll('path.lane-fill');
    fills.forEach((fillEl, i) => {
      const len = tracks[i]?.getTotalLength() ?? 0;
      const key = edgeKey(segments[i].fromId, segments[i].toId);
      const filled = isEdgeFilled(key);
      fillEl.style.strokeDasharray = String(len);
      fillEl.style.strokeDashoffset = filled ? '0' : String(len);
    });
  });
}

function applyCamera(animate = false) {
  stage.classList.toggle('animating', animate);
  stage.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
}

function moduleCenter(id) {
  const node = map.querySelector(`[data-module-anchor="${id}"]`);
  if (!node) return null;
  const left = getNodeAnchor(node, 'left');
  return { x: left.x + node.offsetWidth / 2, y: left.y };
}

function centerOnStart(animate = true) {
  const center = moduleCenter(START_ID);
  if (!center || !viewport) return;
  const vp = viewport.getBoundingClientRect();
  const scale = Math.min(0.9, Math.max(0.72, camera.scale));
  camera = {
    scale,
    x: vp.width * 0.3 - center.x * scale,
    y: vp.height * 0.5 - center.y * scale
  };
  applyCamera(animate);
  requestAnimationFrame(measureConnectors);
}

function centerOnModule(id, animate = true) {
  const center = moduleCenter(id);
  if (!center || !viewport) return;

  const vp = viewport.getBoundingClientRect();
  const scale = Math.min(1.05, Math.max(0.72, camera.scale));

  camera = {
    x: vp.width / 2 - center.x * scale,
    y: vp.height / 2 - center.y * scale,
    scale
  };
  applyCamera(animate);
  requestAnimationFrame(measureConnectors);
}

function fitOverview(animate = false) {
  const bounds = map.getBoundingClientRect();
  const vp = viewport.getBoundingClientRect();
  const pad = 56;
  const scale = Math.min(
    (vp.width - pad * 2) / bounds.width,
    (vp.height - pad * 2) / bounds.height,
    1
  );
  camera = {
    scale: Math.max(0.5, scale),
    x: (vp.width - bounds.width * scale) / 2,
    y: (vp.height - bounds.height * scale) / 2 + 8
  };
  applyCamera(animate);
  requestAnimationFrame(measureConnectors);
}

function setFocus(id) {
  dimOthers = true;
  focusId = id;
  document.querySelectorAll('.node-wrap').forEach((el) => {
    el.classList.toggle('dimmed', el.dataset.moduleAnchor !== id);
  });
  document.querySelectorAll('.module-card').forEach((el) => {
    el.classList.toggle('focus-ring', el.dataset.moduleId === id);
  });
  centerOnModule(id);
}

function nextPlayableId() {
  const playable = PLAY_ORDER.map((id) => getRuntimeModules().find((m) => m.id === id)).filter(
    (m) => m && !m.locked
  );
  const idx = playable.findIndex((m) => m.id === focusId);
  return playable[(idx + 1) % playable.length]?.id ?? START_ID;
}

function zoomAt(factor) {
  const vp = viewport.getBoundingClientRect();
  const mx = vp.width / 2;
  const my = vp.height / 2;
  const nextScale = Math.min(1.6, Math.max(0.45, camera.scale * factor));
  const ratio = nextScale / camera.scale;
  camera = {
    scale: nextScale,
    x: mx - (mx - camera.x) * ratio,
    y: my - (my - camera.y) * ratio
  };
  applyCamera(false);
  requestAnimationFrame(measureConnectors);
}

viewport.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  isPanning = true;
  viewport.classList.add('panning');
  panStart = { x: e.clientX, y: e.clientY, camX: camera.x, camY: camera.y };
  viewport.setPointerCapture(e.pointerId);
});

viewport.addEventListener('pointermove', (e) => {
  if (!isPanning) return;
  camera.x = panStart.camX + (e.clientX - panStart.x);
  camera.y = panStart.camY + (e.clientY - panStart.y);
  applyCamera(false);
});

function endPan(e) {
  if (!isPanning) return;
  isPanning = false;
  viewport.classList.remove('panning');
  try {
    viewport.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  requestAnimationFrame(measureConnectors);
}

viewport.addEventListener('pointerup', endPan);
viewport.addEventListener('pointercancel', endPan);

viewport.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.08 : 1 / 1.08);
  },
  { passive: false }
);

document.getElementById('zoom-in').addEventListener('click', () => zoomAt(1.2));
document.getElementById('zoom-out').addEventListener('click', () => zoomAt(1 / 1.2));
document.getElementById('center-next').addEventListener('click', () => setFocus(nextPlayableId()));

window.addEventListener('wf-module-layout-change', () => {
  renderModules();
  requestAnimationFrame(measureConnectors);
});

window.addEventListener('wf-progress-change', () => {
  renderModules();
  requestAnimationFrame(measureConnectors);
});

renderModules();
requestAnimationFrame(() => {
  measureConnectors();
  centerOnStart(false);
  window.setTimeout(() => centerOnStart(true), 300);
});

const ro = new ResizeObserver(() => measureConnectors());
ro.observe(viewport);
ro.observe(map);

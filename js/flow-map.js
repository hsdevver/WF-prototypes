const MODULES = [
  {
    id: 'm1',
    column: 0,
    title: 'Welcome & goals',
    description: 'Set expectations for this chapter.',
    progress: 100,
    locked: false,
    hue: 230
  },
  {
    id: 'm2',
    column: 1,
    title: 'Map the journey',
    description: 'Identify touchpoints across the customer lifecycle.',
    progress: 100,
    locked: false,
    hue: 245
  },
  {
    id: 'm3',
    column: 1,
    title: 'Moments that matter',
    description: 'Prioritise high-impact interactions.',
    progress: 72,
    locked: false,
    hue: 252,
    focus: true
  },
  {
    id: 'm4',
    column: 2,
    title: 'Design interventions',
    description: 'Prototype improvements for key moments.',
    progress: 0,
    locked: false,
    hue: 258
  },
  {
    id: 'm5',
    column: 2,
    title: 'Measure impact',
    description: 'Define success metrics and feedback loops.',
    progress: 0,
    locked: true,
    hue: 265
  },
  {
    id: 'm6',
    column: 3,
    title: 'Chapter reflection',
    description: 'Summarise learnings and next steps.',
    progress: 0,
    locked: true,
    hue: 272
  }
];

const EDGES = [
  ['m1', 'm2'],
  ['m1', 'm3'],
  ['m2', 'm4'],
  ['m3', 'm4'],
  ['m4', 'm5'],
  ['m5', 'm6']
];

const FILLED_EDGES = new Set(['m1|m2', 'm1|m3', 'm2|m4', 'm3|m4']);

const viewport = document.getElementById('viewport');
const stage = document.getElementById('stage');
const map = document.getElementById('map');
const columnsEl = document.getElementById('columns');
const connectorsEl = document.getElementById('connectors');

let camera = { x: 0, y: 0, scale: 0.85 };
let isPanning = false;
let panStart = { x: 0, y: 0, camX: 0, camY: 0 };
let focusId = MODULES.find((m) => m.focus)?.id ?? MODULES[2].id;

function edgeKey(a, b) {
  return `${a}|${b}`;
}

function columnsFromModules() {
  const cols = [];
  for (const mod of MODULES) {
    while (cols.length <= mod.column) cols.push([]);
    cols[mod.column].push(mod);
  }
  return cols;
}

function gradientFor(hue) {
  return `linear-gradient(135deg, hsl(${hue} 75% 82%) 0%, hsl(${hue + 12} 70% 68%) 100%)`;
}

function renderModules() {
  const columns = columnsFromModules();
  columnsEl.innerHTML = '';

  columns.forEach((colMods, colIdx) => {
    const column = document.createElement('div');
    column.className = 'column';
    column.setAttribute('role', 'group');
    column.dataset.column = String(colIdx);

    for (const mod of colMods) {
      const wrap = document.createElement('div');
      wrap.className = 'node-wrap';
      wrap.dataset.moduleAnchor = mod.id;
      if (mod.id !== focusId) wrap.classList.add('dimmed');

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'module-card';
      card.dataset.moduleId = mod.id;
      if (mod.locked) card.classList.add('locked');
      if (mod.id === focusId) card.classList.add('focus-ring');

      const image = document.createElement('div');
      image.className = 'module-image';
      if (mod.locked) image.classList.add('module-image--locked');
      image.style.background = gradientFor(mod.hue);

      if (mod.locked) {
        const lock = document.createElement('div');
        lock.className = 'lock-badge';
        lock.innerHTML =
          '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/></svg>';
        image.appendChild(lock);
      }

      const info = document.createElement('div');
      info.className = 'module-info';
      info.innerHTML = `<h3>${mod.title}</h3><p>${mod.description}</p>`;

      if (mod.progress > 0) {
        const bar = document.createElement('div');
        bar.className = 'progress-bar';
        bar.innerHTML = `<div class="progress-fill" style="width:${mod.progress}%"></div>`;
        const pct = document.createElement('p');
        pct.className = 'progress-text';
        pct.textContent = `${mod.progress}%`;
        info.appendChild(bar);
        info.appendChild(pct);
      }

      card.append(image, info);
      card.addEventListener('click', () => setFocus(mod.id));
      wrap.appendChild(card);
      column.appendChild(wrap);
    }

    columnsEl.appendChild(column);
  });
}

function getNodeCenter(nodeEl) {
  const mapRect = map.getBoundingClientRect();
  const nodeRect = nodeEl.getBoundingClientRect();
  return {
    x: (nodeRect.left + nodeRect.width / 2 - mapRect.left) / camera.scale,
    y: (nodeRect.top + nodeRect.height / 2 - mapRect.top) / camera.scale
  };
}

function connectorPath(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const c1x = from.x + dx * 0.45;
  const c2x = to.x - dx * 0.45;
  return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`;
}

function measureConnectors() {
  const segments = [];
  let maxX = 0;
  let maxY = 0;

  for (const [fromId, toId] of EDGES) {
    const fromEl = map.querySelector(`[data-module-anchor="${fromId}"]`);
    const toEl = map.querySelector(`[data-module-anchor="${toId}"]`);
    if (!fromEl || !toEl) continue;

    const from = getNodeCenter(fromEl);
    const to = getNodeCenter(toEl);
    const d = connectorPath(from, to);
    const length = Math.hypot(to.x - from.x, to.y - from.y) * 1.35;
    maxX = Math.max(maxX, from.x, to.x);
    maxY = Math.max(maxY, from.y, to.y);
    segments.push({ fromId, toId, d, length });
  }

  connectorsEl.setAttribute('width', String(Math.max(maxX + 80, map.offsetWidth)));
  connectorsEl.setAttribute('height', String(Math.max(maxY + 80, map.offsetHeight)));
  connectorsEl.innerHTML = '';

  for (const seg of segments) {
    const key = edgeKey(seg.fromId, seg.toId);
    const filled = FILLED_EDGES.has(key);

    const track = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    track.setAttribute('d', seg.d);
    track.setAttribute('class', 'lane-track');

    const fill = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    fill.setAttribute('d', seg.d);
    fill.setAttribute('class', `lane-fill${filled ? ' filled' : ''}`);
    if (filled) {
      fill.style.strokeDasharray = String(seg.length);
      fill.style.strokeDashoffset = '0';
    } else {
      fill.style.strokeDasharray = String(seg.length);
      fill.style.strokeDashoffset = String(seg.length);
    }

    connectorsEl.append(track, fill);
  }
}

function applyCamera(animate = false) {
  stage.classList.toggle('animating', animate);
  stage.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
}

function centerOnModule(id, animate = true) {
  const node = map.querySelector(`[data-module-anchor="${id}"]`);
  if (!node || !viewport) return;

  const vp = viewport.getBoundingClientRect();
  const center = getNodeCenter(node);
  const scale = Math.min(1.1, Math.max(0.75, camera.scale));

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
  const pad = 48;
  const scale = Math.min(
    (vp.width - pad * 2) / bounds.width,
    (vp.height - pad * 2) / bounds.height,
    1
  );
  camera = {
    scale: Math.max(0.55, scale),
    x: (vp.width - bounds.width * scale) / 2,
    y: (vp.height - bounds.height * scale) / 2 + 12
  };
  applyCamera(animate);
  requestAnimationFrame(measureConnectors);
}

function setFocus(id) {
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
  const playable = MODULES.filter((m) => !m.locked);
  const idx = playable.findIndex((m) => m.id === focusId);
  return playable[(idx + 1) % playable.length]?.id ?? focusId;
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

renderModules();
fitOverview(false);
window.setTimeout(() => centerOnModule(focusId, true), 400);

const ro = new ResizeObserver(() => measureConnectors());
ro.observe(viewport);
ro.observe(map);

/** Metaball cord layout — port blobs + bridge pill, merged via SVG goo filter. */

const METABALL_PAD = 36;

function localPoint(p, origin) {
  return { x: p.x - origin.x, y: p.y - origin.y };
}

export function metaballBounds(p0, p3, pad = METABALL_PAD) {
  const x0 = Math.min(p0.x, p3.x) - pad;
  const y0 = Math.min(p0.y, p3.y) - pad;
  const x1 = Math.max(p0.x, p3.x) + pad;
  const y1 = Math.max(p0.y, p3.y) + pad;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Capsule at a module port (bulges into the gap). */
function portLayout(side, anchor) {
  const vertical = side === 'left' || side === 'right';
  const w = vertical ? 22 : 52;
  const h = vertical ? 52 : 22;
  let x = anchor.x - w / 2;
  let y = anchor.y - h / 2;
  const inset = vertical ? w * 0.38 : h * 0.38;
  if (side === 'right') x -= inset;
  if (side === 'left') x += inset;
  if (side === 'bottom') y -= inset;
  if (side === 'top') y += inset;
  return { x, y, width: w, height: h, borderRadius: Math.min(w, h) };
}

/** Pill between two anchors. */
function bridgeLayout(p0, p3, reveal = 1) {
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const thick = Math.max(16, Math.min(26, len * 0.09));
  const span = Math.max(12, (len - 36) * reveal);
  const cx = (p0.x + p3.x) / 2;
  const cy = (p0.y + p3.y) / 2;
  return {
    x: cx - span / 2,
    y: cy - thick / 2,
    width: span,
    height: thick,
    angle,
    borderRadius: thick / 2
  };
}

function applyBlobStyle(el, layout) {
  el.style.left = `${layout.x}px`;
  el.style.top = `${layout.y}px`;
  el.style.width = `${layout.width}px`;
  el.style.height = `${layout.height}px`;
  el.style.borderRadius =
    typeof layout.borderRadius === 'number' ? `${layout.borderRadius}px` : layout.borderRadius;
  if (layout.angle != null) {
    el.style.transform = `rotate(${layout.angle}deg)`;
  } else {
    el.style.transform = '';
  }
}

/**
 * Build a filtered metaball group for one edge.
 * @param {object} seg — cord segment with p0, p3, fromSide, toSide
 */
export function layoutMetaballSegment(seg) {
  const bounds = metaballBounds(seg.p0, seg.p3);
  const origin = { x: bounds.x, y: bounds.y };
  const p0 = localPoint(seg.p0, origin);
  const p3 = localPoint(seg.p3, origin);
  const reveal = Math.max(0.04, Math.min(1, seg.bridgeReveal ?? 1));

  if (!seg.metaballEl) {
    const root = document.createElement('div');
    root.className = 'intro-metaball';
    root.dataset.edge = seg.key;

    const from = document.createElement('div');
    from.className = 'intro-metaball__blob intro-metaball__blob--port';
    const bridge = document.createElement('div');
    bridge.className = 'intro-metaball__blob intro-metaball__blob--bridge';
    const to = document.createElement('div');
    to.className = 'intro-metaball__blob intro-metaball__blob--port';

    root.append(from, bridge, to);
    seg.metaballEl = root;
    seg.metaballPortFrom = from;
    seg.metaballBridge = bridge;
    seg.metaballPortTo = to;
  }

  const el = seg.metaballEl;
  el.style.left = `${bounds.x}px`;
  el.style.top = `${bounds.y}px`;
  el.style.width = `${bounds.width}px`;
  el.style.height = `${bounds.height}px`;

  applyBlobStyle(seg.metaballPortFrom, portLayout(seg.fromSide, p0));
  applyBlobStyle(seg.metaballBridge, bridgeLayout(p0, p3, reveal));
  applyBlobStyle(seg.metaballPortTo, portLayout(seg.toSide, p3));

  return el;
}

export function ensureMetaballFilter(pathMapEl) {
  if (!pathMapEl || pathMapEl.querySelector('#intro-metaball-filter')) return;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'intro-metaball-defs');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.innerHTML = `
    <defs>
      <filter id="intro-metaball" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur" />
        <feColorMatrix in="blur" type="matrix" values="
          1 0 0 0 0
          0 1 0 0 0
          0 0 1 0 0
          0 0 0 22 -10" result="goo" />
        <feComposite in="goo" in2="goo" operator="over" />
      </filter>
    </defs>
  `;
  pathMapEl.insertBefore(svg, pathMapEl.firstChild);
}

export function getMetaballLayer(pathMapEl) {
  if (!pathMapEl) return null;
  let layer = pathMapEl.querySelector('#intro-metaball-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'intro-metaball-layer';
    layer.className = 'intro-metaball-layer';
    layer.setAttribute('aria-hidden', 'true');
    const connectors = pathMapEl.querySelector('#intro-connectors');
    if (connectors) pathMapEl.insertBefore(layer, connectors);
    else pathMapEl.appendChild(layer);
  }
  return layer;
}

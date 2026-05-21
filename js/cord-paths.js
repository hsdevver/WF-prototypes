/** Unit normal for exit/entry handles on each card side. */
const SIDE_NORMAL = {
  left: [-1, 0],
  right: [1, 0],
  top: [0, -1],
  bottom: [0, 1]
};

/**
 * Anchor on a module wrap rect (map-local coordinates).
 * @param {DOMRect} rect
 * @param {'left'|'right'|'top'|'bottom'} side
 * @param {DOMRect} containerRect
 */
/**
 * @param {number} [along] — 0–1 position along vertical sides (left/right) or horizontal (top/bottom)
 */
export function anchorFromRect(rect, side, containerRect, along = 0.5) {
  const left = rect.left - containerRect.left;
  const top = rect.top - containerRect.top;
  const right = rect.right - containerRect.left;
  const bottom = rect.bottom - containerRect.top;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const t = Math.max(0, Math.min(1, along));

  switch (side) {
    case 'left':
      return { x: left, y: top + (bottom - top) * t };
    case 'right':
      return { x: right, y: top + (bottom - top) * t };
    case 'top':
      return { x: left + (right - left) * t, y: top };
    case 'bottom':
      return { x: left + (right - left) * t, y: bottom };
    default:
      return { x: cx, y: cy };
  }
}

function cubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const u2 = u * u;
  const t2 = t * t;
  const u3 = u2 * u;
  const t3 = t2 * t;
  return {
    x: u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
    y: u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y
  };
}

function cubicTangentAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
  };
}

/**
 * Cubic centerline control points (shared by rope stroke and organic bridge).
 */
export function cordCurveControls(p0, fromSide, p3, toSide, options = {}) {
  const slack = options.slack ?? 1;
  const dist = Math.hypot(p3.x - p0.x, p3.y - p0.y) || 1;
  const handle = Math.max(38, dist * 0.44) * slack;

  const [ex, ey] = SIDE_NORMAL[fromSide] ?? [1, 0];
  const [ix, iy] = SIDE_NORMAL[toSide] ?? [-1, 0];

  const nx = -(p3.y - p0.y) / dist;
  const ny = (p3.x - p0.x) / dist;

  const phase = options.phase ?? 0;
  const phaseOff = options.phaseOffset ?? 0;
  const breeze = options.breezePhase ?? phase;

  const wobbleAmp = options.wobbleAmp ?? Math.min(4.5, dist * 0.024);
  const wobble =
    Math.sin(breeze + phaseOff) * wobbleAmp +
    Math.sin(breeze * 1.43 + phaseOff * 1.05) * wobbleAmp * 0.36 +
    Math.sin(breeze * 0.68 + phaseOff * 1.55) * wobbleAmp * 0.2;

  const breezeDriftX = Math.sin(breeze * 0.41 + phaseOff * 0.8) * wobbleAmp * 0.28;
  const breezeDriftY = Math.cos(breeze * 0.52 + phaseOff * 1.2) * wobbleAmp * 0.18;

  const sagBase = options.sag ?? dist * 0.17;
  const sagPulse = 1 + Math.sin(phase * 0.62 + (options.sagOffset ?? 0)) * 0.07;
  const plugSettle = Math.max(0, Math.min(1, options.plugSettle ?? 0));

  const gravSign = options.sagSign ?? 1;
  const hang = sagBase * sagPulse * gravSign;
  const gravityY = dist * 0.022 + hang * 0.42 + plugSettle * dist * 0.028;

  const hangX = nx * hang + wobble + breezeDriftX;
  const hangY = ny * hang + breezeDriftY + gravityY;

  const entryShorten = 1 - plugSettle * 0.34;
  const exitShorten = 1 - plugSettle * 0.1;
  const tuckIntoPort = plugSettle * handle * 0.26;

  let p1x = p0.x + ex * handle * exitShorten + hangX;
  let p1y = p0.y + ey * handle * exitShorten + hangY * 0.45;
  let p2x =
    p3.x - ix * handle * entryShorten + hangX * 0.72 - wobble * 0.45 - ix * tuckIntoPort;
  let p2y =
    p3.y - iy * handle * entryShorten + hangY * 0.95 + iy * tuckIntoPort * 0.55;

  const pull = options.stretchPull;
  if (pull && pull.amt > 0.002) {
    const midX = (p0.x + p3.x) * 0.5;
    const midY = (p0.y + p3.y) * 0.5;
    const pullX = (pull.x - midX) * pull.amt * 0.88;
    const pullY = (pull.y - midY) * pull.amt * 0.88;
    p1x += pullX * 0.92;
    p1y += pullY * 0.92;
    p2x += pullX * 0.78;
    p2y += pullY * 0.78;
  }

  return {
    p0,
    p1: { x: p1x, y: p1y },
    p2: { x: p2x, y: p2y },
    p3
  };
}

/**
 * Slack cubic-bezier rope with gravity hang, breeze drift, and plug-in settle.
 */
export function cordPathD(p0, fromSide, p3, toSide, options = {}) {
  const { p0: s, p1, p2, p3: e } = cordCurveControls(p0, fromSide, p3, toSide, options);
  return `M ${s.x} ${s.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${e.x} ${e.y}`;
}

/** Point along the centerline at parameter t ∈ [0, 1]. */
export function cordCenterlinePoint(p0, fromSide, p3, toSide, t, options = {}) {
  const curve = cordCurveControls(p0, fromSide, p3, toSide, options);
  return cubicAt(curve.p0, curve.p1, curve.p2, curve.p3, Math.max(0, Math.min(1, t)));
}

function smoothRibbonEdge(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const mx = (prev.x + curr.x) * 0.5;
    const my = (prev.y + curr.y) * 0.5;
    d += ` Q ${prev.x.toFixed(2)} ${prev.y.toFixed(2)}, ${mx.toFixed(2)} ${my.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return d;
}

/**
 * Organic taffy bridge — filled ribbon bulging at card ends, pinched in the middle.
 * `reveal` (0–1) grows the bridge along the centerline for plug-in animation.
 */
export function cordBridgePathD(p0, fromSide, p3, toSide, options = {}) {
  const curve = cordCurveControls(p0, fromSide, p3, toSide, options);
  const dist = Math.hypot(curve.p3.x - curve.p0.x, curve.p3.y - curve.p0.y) || 1;
  const reveal = Math.max(0.02, Math.min(1, options.reveal ?? 1));

  const endBulge = options.endWidth ?? Math.max(34, dist * 0.155);
  const midPinch = options.midWidth ?? Math.max(8, endBulge * 0.22);

  const phase = options.phase ?? 0;
  const phaseOff = options.phaseOffset ?? 0;
  const breathe = 1 + Math.sin(phase * 0.55 + phaseOff) * 0.035;

  const sampleCount = Math.max(18, Math.min(44, Math.round(dist / 22)));
  const steps = Math.max(3, Math.ceil(sampleCount * reveal));

  const upper = [];
  const lower = [];

  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * reveal;
    const pt = cubicAt(curve.p0, curve.p1, curve.p2, curve.p3, t);
    const tan = cubicTangentAt(curve.p0, curve.p1, curve.p2, curve.p3, t);
    const tLen = Math.hypot(tan.x, tan.y) || 1;
    const nx = -tan.y / tLen;
    const ny = tan.x / tLen;

    const pinch = Math.pow(Math.sin(t * Math.PI), 0.68);
    let halfW = (midPinch + (endBulge - midPinch) * (1 - pinch)) * 0.5 * breathe;

    const ripple =
      Math.sin(t * 11 + phase + phaseOff) * dist * 0.0035 +
      Math.sin(t * 6.2 + phaseOff * 1.3) * dist * 0.002;
    halfW += ripple;

    if (reveal < 1 && i === steps) {
      halfW *= 0.42;
    }

    upper.push({ x: pt.x + nx * halfW, y: pt.y + ny * halfW });
    lower.push({ x: pt.x - nx * halfW, y: pt.y - ny * halfW });
  }

  const upperD = smoothRibbonEdge(upper);
  const lowerD = smoothRibbonEdge([...lower].reverse());
  return `${upperD} ${lowerD} Z`;
}

/**
 * Orthogonal “subway map” connector — horizontal lanes, vertical joins, rounded elbows.
 * Matches Vignelli-style diagram paths (flow-map connectorPath, tuned for intro cords).
 */
function subwayPathRightLeft(fromX, fromY, toX, toY, laneGap = 28, radius = 28, midXOverride = null) {
  if (Math.abs(fromY - toY) < 1) {
    return `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} L ${toX.toFixed(2)} ${toY.toFixed(2)}`;
  }

  const dirX = toX >= fromX ? 1 : -1;
  const exitX = fromX + dirX * laneGap;
  const entryX = toX - dirX * laneGap;
  const midX = midXOverride ?? (exitX + entryX) / 2;

  const dy = toY - fromY;
  const sy = dy >= 0 ? 1 : -1;
  const ey = toX >= midX ? 1 : -1;

  const r = Math.min(
    radius,
    Math.abs(midX - fromX) * 0.48,
    Math.abs(midX - exitX) * 0.95,
    Math.abs(dy) * 0.48,
    Math.abs(toX - entryX) * 0.48
  );

  if (r < 3) {
    return `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} H ${midX.toFixed(2)} V ${toY.toFixed(2)} H ${toX.toFixed(2)}`;
  }

  return [
    `M ${fromX.toFixed(2)} ${fromY.toFixed(2)}`,
    `H ${(midX - dirX * r).toFixed(2)}`,
    `Q ${midX.toFixed(2)} ${fromY.toFixed(2)} ${midX.toFixed(2)} ${(fromY + sy * r).toFixed(2)}`,
    `V ${(toY - sy * r).toFixed(2)}`,
    `Q ${midX.toFixed(2)} ${toY.toFixed(2)} ${(midX + ey * r).toFixed(2)} ${toY.toFixed(2)}`,
    `H ${toX.toFixed(2)}`
  ].join(' ');
}

/** Body stroke width — parallel lanes touch with no gutter (corporate subway). */
export const SUBWAY_LANE_PITCH = 11;

/** Horizontal spacing between vertical subway trunks (avoids tube crossings). */
export const SUBWAY_MID_LANE_PITCH = 18;

/** Extra exit spacing when multiple tubes leave the same card edge. */
export const SUBWAY_FROM_FAN_PITCH = 15;

/**
 * Stack fork/merge endpoints on the same card edge so tubes exit inline (no gap).
 * @param {{ key: string, isSubway?: boolean, fromSide: string, toSide: string, p0: {x:number,y:number}, p3: {x:number,y:number} }[]} segments
 * @param {number} [lanePitch]
 */
export function applySubwayLaneBundles(segments, lanePitch = SUBWAY_LANE_PITCH) {
  if (!segments?.length) return;

  const bundle = (list, end, pitch = lanePitch) => {
    if (list.length < 2) return;
    list.sort((a, b) => (end === 'p0' ? a.p0.y - b.p0.y : a.p3.y - b.p3.y));
    const avgY =
      list.reduce((sum, seg) => sum + (end === 'p0' ? seg.p0.y : seg.p3.y), 0) / list.length;
    const n = list.length;
    list.forEach((seg, i) => {
      const y = avgY + (i - (n - 1) / 2) * pitch;
      if (end === 'p0') seg.p0 = { x: seg.p0.x, y };
      else seg.p3 = { x: seg.p3.x, y };
    });
  };

  const fromBuckets = new Map();
  const toBuckets = new Map();

  for (const seg of segments) {
    if (!seg.isSubway) continue;
    const [fromId, toId] = seg.key.split('|');
    const fromKey = `${fromId}\0${seg.fromSide}`;
    const toKey = `${toId}\0${seg.toSide}`;
    if (!fromBuckets.has(fromKey)) fromBuckets.set(fromKey, []);
    fromBuckets.get(fromKey).push(seg);
    if (!toBuckets.has(toKey)) toBuckets.set(toKey, []);
    toBuckets.get(toKey).push(seg);
  }

  const bundleIncoming = (list) => {
    if (list.length < 2) return;
    const alongSpread =
      Math.max(...list.map((s) => s.anchorOpts?.toAlong ?? 0.5)) -
      Math.min(...list.map((s) => s.anchorOpts?.toAlong ?? 0.5));
    if (alongSpread > 0.08) return;
    bundle(list, 'p3', lanePitch);
  };

  for (const list of fromBuckets.values()) {
    const pitch = list.length > 1 ? SUBWAY_FROM_FAN_PITCH : lanePitch;
    bundle(list, 'p0', pitch);
  }
  for (const list of toBuckets.values()) bundleIncoming(list);
}

/**
 * Stagger each edge's vertical trunk (midX) so parallel tubes between the same columns do not cross.
 * @param {{ key: string, isSubway?: boolean, fromSide: string, toSide: string, p0: {x:number,y:number}, p3: {x:number,y:number}, anchorOpts?: object }[]} segments
 */
export function applySubwayMidXLanes(segments, pitch = SUBWAY_MID_LANE_PITCH) {
  if (!segments?.length) return;

  const buckets = new Map();

  for (const seg of segments) {
    if (!seg.isSubway) continue;
    const rl = seg.fromSide === 'right' && seg.toSide === 'left';
    const lr = seg.fromSide === 'left' && seg.toSide === 'right';
    if (!rl && !lr) continue;

    const fromX = rl ? seg.p0.x : seg.p3.x;
    const toX = rl ? seg.p3.x : seg.p0.x;
    const key = `${Math.round(fromX / 12)}|${Math.round(toX / 12)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ seg, rl });
  }

  for (const list of buckets.values()) {
    if (list.length < 2) continue;

    list.sort((a, b) => {
      const ay = a.seg.p0.y;
      const by = b.seg.p0.y;
      if (ay !== by) return ay - by;
      return a.seg.p3.y - b.seg.p3.y;
    });

    const n = list.length;
    const lanePitch =
      n >= 4 ? SUBWAY_MID_LANE_PITCH + 6 : n >= 3 ? SUBWAY_MID_LANE_PITCH + 3 : pitch;
    list.forEach((item, i) => {
      const { seg, rl } = item;
      const from = rl ? seg.p0 : seg.p3;
      const to = rl ? seg.p3 : seg.p0;
      const dx = to.x - from.x;
      const dirX = dx >= 0 ? 1 : -1;
      const laneGap = Math.min(56, Math.max(24, Math.abs(dx) * 0.22));
      const exitX = from.x + dirX * laneGap;
      const entryX = to.x - dirX * laneGap;
      const baseMidX = (exitX + entryX) * 0.5;
      const offset = (i - (n - 1) / 2) * lanePitch;
      seg.anchorOpts = { ...seg.anchorOpts, subwayMidX: baseMidX + offset };
    });
  }
}

const SUBWAY_PAINT_DY_EPS = 4;

/** Signed vertical travel for a right→left subway edge (source → target). */
function subwayTrunkDy(seg) {
  const rl = seg.fromSide === 'right' && seg.toSide === 'left';
  return rl ? seg.p3.y - seg.p0.y : seg.p0.y - seg.p3.y;
}

/**
 * Paint-order for subway cords: downward edges under upward edges at elbows.
 * SVG stacks later siblings on top; call after lane bundling / midX stagger.
 * @param {{ key: string, isSubway?: boolean, fromSide: string, toSide: string, p0: {x:number,y:number}, p3: {x:number,y:number} }[]} segments
 */
export function sortSubwayCordPaintOrder(segments) {
  if (!segments?.length) return;

  const tier = (seg) => {
    if (!seg.isSubway) return 1;
    const dy = subwayTrunkDy(seg);
    if (dy > SUBWAY_PAINT_DY_EPS) return 0;
    if (dy < -SUBWAY_PAINT_DY_EPS) return 2;
    return 1;
  };

  segments.sort((a, b) => {
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;
    if (a.p0.y !== b.p0.y) return a.p0.y - b.p0.y;
    if (a.p3.y !== b.p3.y) return a.p3.y - b.p3.y;
    return a.key.localeCompare(b.key);
  });
}

/**
 * Subway-style cord path for corporate intro (smooth elbows, no rope sag).
 */
export function subwayCordPathD(p0, fromSide, p3, toSide, options = {}) {
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const dist = Math.hypot(dx, dy) || 1;

  if (fromSide === 'right' && toSide === 'left') {
    const laneGap =
      options.laneGap ?? Math.min(56, Math.max(24, Math.abs(dx) * 0.22));
    const radius =
      options.radius ??
      Math.min(40, Math.max(22, Math.abs(dy) * 0.22, Math.abs(dx) * 0.1));
    return subwayPathRightLeft(p0.x, p0.y, p3.x, p3.y, laneGap, radius, options.subwayMidX);
  }

  if (fromSide === 'left' && toSide === 'right') {
    const laneGap =
      options.laneGap ?? Math.min(56, Math.max(24, Math.abs(dx) * 0.22));
    const radius =
      options.radius ??
      Math.min(40, Math.max(22, Math.abs(dy) * 0.22, Math.abs(dx) * 0.1));
    return subwayPathRightLeft(p3.x, p3.y, p0.x, p0.y, laneGap, radius, options.subwayMidX);
  }

  return cordPathD(p0, fromSide, p3, toSide, options);
}

/** Stable phase offset per edge so ropes drift out of sync. */
export function cordPhaseOffset(edgeKey) {
  let hash = 0;
  for (let i = 0; i < edgeKey.length; i++) hash = (hash * 31 + edgeKey.charCodeAt(i)) | 0;
  return (hash % 628) / 100;
}

export function edgeKey(a, b) {
  return `${a}|${b}`;
}

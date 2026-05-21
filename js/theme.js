export const STORAGE_SKIN = 'wf-proto-skin';
export const STORAGE_APPEARANCE = 'wf-proto-appearance';
export const STORAGE_CORPORATE_APPEARANCE = 'wf-proto-corporate-appearance';
export const STORAGE_THEME_COLOR = 'wf-proto-theme-color';
export const DEFAULT_THEME_COLOR = '#6baed0';
export const DEFAULT_CORPORATE_THEME_COLOR = '#c85a42';
export const DEFAULT_APPEARANCE = 'dark';
export const DEFAULT_CORPORATE_APPEARANCE = 'image';
export const DEFAULT_SKIN = 'space';

export const SKINS = [
  { id: 'space', label: 'Space' },
  { id: 'corporate', label: 'Corporate' }
];

export const CORPORATE_APPEARANCES = [
  { id: 'image', label: 'Image' },
  { id: 'color', label: 'Colour theme' }
];

const THEME_PRESETS = ['#6baed0', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
const CORPORATE_THEME_PRESETS = ['#c85a42', '#6366f1', '#0d9488', '#ca8a04', '#db2777', '#7c3aed'];

export function getThemePresets() {
  return THEME_PRESETS;
}

export function getCorporateThemePresets() {
  return CORPORATE_THEME_PRESETS;
}

function normalizeSkin(skin) {
  return skin === 'corporate' ? 'corporate' : 'space';
}

function normalizeSpaceAppearance(appearance) {
  return appearance === 'light' ? 'light' : 'dark';
}

function normalizeCorporateAppearance(appearance) {
  return appearance === 'color' ? 'color' : 'image';
}

export function getThemeState() {
  return {
    skin: normalizeSkin(localStorage.getItem(STORAGE_SKIN) || DEFAULT_SKIN),
    appearance: localStorage.getItem(STORAGE_APPEARANCE) || DEFAULT_APPEARANCE,
    corporateAppearance:
      localStorage.getItem(STORAGE_CORPORATE_APPEARANCE) || DEFAULT_CORPORATE_APPEARANCE,
    themeColor: localStorage.getItem(STORAGE_THEME_COLOR) || DEFAULT_THEME_COLOR
  };
}

function hexToRgb(hex) {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.padStart(6, '0').slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 107, g: 174, b: 208 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
        break;
      case gn:
        h = ((bn - rn) / d + 2) / 6;
        break;
      default:
        h = ((rn - gn) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const hn = ((h % 360) + 360) % 360 / 360;

  if (sn === 0) {
    const v = Math.round(ln * 255);
    const hex = v.toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  }

  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;

  const hueToRgb = (t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const r = Math.round(hueToRgb(hn + 1 / 3) * 255);
  const g = Math.round(hueToRgb(hn) * 255);
  const b = Math.round(hueToRgb(hn - 1 / 3) * 255);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function normalizeHex(input) {
  if (!input) return DEFAULT_THEME_COLOR;
  let hex = String(input).trim();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (!/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex)) return DEFAULT_THEME_COLOR;
  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex.toLowerCase();
}

/** Derive hero gradient stops + accent tones from a single primary (corporate colour theme). */
export function deriveCorporatePalette(primaryHex) {
  const primary = normalizeHex(primaryHex);
  const { r, g, b } = hexToRgb(primary);
  const { h, s, l } = rgbToHsl(r, g, b);

  const deep = hslToHex(h, Math.min(92, s * 0.72 + 14), Math.max(10, l * 0.38));
  const mid = hslToHex(h, Math.min(88, s * 0.82 + 8), Math.max(18, l * 0.58));
  const bright = hslToHex((h + 4) % 360, Math.min(90, s * 0.95 + 4), Math.min(68, l * 1.12 + 14));
  const glow = hslToHex((h + 8) % 360, Math.min(95, s * 1.05), Math.min(78, l * 1.2 + 18));

  const heroGradient = `linear-gradient(145deg, #141820 0%, ${deep} 34%, ${mid} 68%, ${bright} 100%)`;
  const heroGlow = `radial-gradient(ellipse 72% 92% at 88% 52%, ${rgba(glow, 0.48)} 0%, transparent 58%)`;

  return {
    primary,
    accent: bright,
    accentSoft: rgba(bright, 0.26),
    accentBorder: rgba(bright, 0.92),
    heroGradient,
    heroGlow,
    deep,
    mid,
    bright
  };
}

const CORPORATE_ACCENT_VARS = [
  '--corporate-accent',
  '--corporate-accent-soft',
  '--corporate-accent-border'
];

const CORPORATE_HERO_VARS = [
  '--corporate-hero-gradient',
  '--corporate-hero-glow',
  '--corporate-hero-deep',
  '--corporate-hero-mid',
  '--corporate-hero-bright'
];

function clearCorporateAccentVars(root) {
  CORPORATE_ACCENT_VARS.forEach((name) => root.style.removeProperty(name));
}

function clearCorporateHeroVars(root) {
  CORPORATE_HERO_VARS.forEach((name) => root.style.removeProperty(name));
}

function applyCorporateAccentVars(root, palette) {
  root.style.setProperty('--corporate-accent', palette.accent);
  root.style.setProperty('--corporate-accent-soft', palette.accentSoft);
  root.style.setProperty('--corporate-accent-border', palette.accentBorder);
}

function applyCorporateHeroVars(root, palette) {
  root.style.setProperty('--corporate-hero-gradient', palette.heroGradient);
  root.style.setProperty('--corporate-hero-glow', palette.heroGlow);
  root.style.setProperty('--corporate-hero-deep', palette.deep);
  root.style.setProperty('--corporate-hero-mid', palette.mid);
  root.style.setProperty('--corporate-hero-bright', palette.bright);
}

function applyThemeColorVars(root, themeColor) {
  root.style.setProperty('--theme-color', themeColor);
  root.style.setProperty('--theme-color-soft', rgba(themeColor, 0.15));
  root.style.setProperty('--theme-color-ring', rgba(themeColor, 0.45));
  root.style.setProperty('--theme-color-strong', rgba(themeColor, 0.65));
  root.style.setProperty('--theme-color-fill', rgba(themeColor, 0.72));
  root.style.setProperty('--accent', themeColor);
}

/** Page-relative hero photo (avoids CSS-file-relative url() 404s). */
function applyCorporateHeroPhoto(root, skin, corporateAppearance) {
  if (skin !== 'corporate' || corporateAppearance !== 'image') {
    root.style.removeProperty('--corporate-hero-photo');
    return;
  }

  const photoUrl = new URL('../assets/corporate-hero-office.jpg', window.location.href).href;
  root.style.setProperty('--corporate-hero-photo', `url("${photoUrl}")`);
}

export function applyTheme(state = getThemeState()) {
  const skin = normalizeSkin(state.skin);
  const appearance = normalizeSpaceAppearance(state.appearance);
  const corporateAppearance = normalizeCorporateAppearance(state.corporateAppearance);
  let themeColor = normalizeHex(state.themeColor);
  const root = document.documentElement;

  root.dataset.skin = skin;
  root.dataset.appearance = appearance;
  root.dataset.corporateAppearance = corporateAppearance;
  applyCorporateHeroPhoto(root, skin, corporateAppearance);

  if (skin === 'corporate') {
    const primary = normalizeHex(state.themeColor || DEFAULT_CORPORATE_THEME_COLOR);
    const palette = deriveCorporatePalette(primary);
    applyCorporateAccentVars(root, palette);
    if (corporateAppearance === 'color') {
      applyCorporateHeroVars(root, palette);
    } else {
      clearCorporateHeroVars(root);
    }
    themeColor = palette.primary;
    applyThemeColorVars(root, palette.accent);
  } else {
    clearCorporateAccentVars(root);
    clearCorporateHeroVars(root);
    applyThemeColorVars(root, themeColor);
  }

  localStorage.setItem(STORAGE_SKIN, skin);
  localStorage.setItem(STORAGE_APPEARANCE, appearance);
  localStorage.setItem(STORAGE_CORPORATE_APPEARANCE, corporateAppearance);
  localStorage.setItem(STORAGE_THEME_COLOR, themeColor);

  const payload = {
    type: 'wf-theme',
    skin,
    appearance,
    corporateAppearance,
    themeColor
  };

  window.dispatchEvent(new CustomEvent('wf-theme-change', { detail: payload }));

  document.querySelectorAll('iframe').forEach((frame) => {
    try {
      frame.contentWindow?.postMessage(payload, '*');
    } catch {
      /* cross-origin */
    }
  });

  return { skin, appearance, corporateAppearance, themeColor };
}

/** Read skin from ?skin= or #skin= / #corporate (before modules run). */
export function skinFromLocation(loc = location) {
  const query = new URLSearchParams(loc.search);
  let raw = query.get('skin');
  if (!raw && loc.hash) {
    const hash = loc.hash.replace(/^#/, '').trim();
    if (hash === 'corporate' || hash === 'space') {
      raw = hash;
    } else if (hash.includes('=')) {
      const hashQuery = hash.startsWith('?') ? hash.slice(1) : hash;
      raw = new URLSearchParams(hashQuery).get('skin');
    }
  }
  const skin = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (skin === 'corporate' || skin === 'space') return skin;
  return null;
}

export function applySkinFromLocation(loc = location) {
  const skin = skinFromLocation(loc);
  if (!skin) return null;
  document.documentElement.dataset.skin = skin;
  return skin;
}

function themeStateFromSearch() {
  const skin = skinFromLocation();
  if (!skin) return null;
  return { ...getThemeState(), skin: normalizeSkin(skin) };
}

export function initTheme() {
  applyTheme(themeStateFromSearch() ?? undefined);

  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'wf-theme') return;
    applyTheme({
      skin: event.data.skin,
      appearance: event.data.appearance,
      corporateAppearance: event.data.corporateAppearance,
      themeColor: event.data.themeColor
    });
  });

  window.addEventListener('storage', (event) => {
    if (
      event.key === STORAGE_SKIN ||
      event.key === STORAGE_APPEARANCE ||
      event.key === STORAGE_CORPORATE_APPEARANCE ||
      event.key === STORAGE_THEME_COLOR
    ) {
      applyTheme();
    }
  });
}

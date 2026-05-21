import {
  applyTheme,
  CORPORATE_APPEARANCES,
  getCorporateThemePresets,
  getThemePresets,
  getThemeState,
  initTheme,
  normalizeHex,
  SKINS
} from './theme.js?v=corporate-hero-office-1';
import {
  applyModuleLayout,
  getModuleLayout,
  initModuleLayout,
  MODULE_LAYOUTS
} from './module-layout.js';
import {
  getMusicVolumePercent,
  isMusicMuted,
  setMusicMuted,
  setMusicVolume,
  initAmbientMusicSync
} from './ambient-music.js';
import {
  resetConsequenceProgress,
  unlockAllConsequenceProgress
} from './consequence-progress.js';
import {
  HOVER_SOUND_CATEGORIES,
  getHoverSoundCategory,
  getHoverSoundMode,
  getHoverSoundVolumePercent,
  initModuleCardSounds,
  setHoverSoundCategory,
  setHoverSoundMode,
  setHoverSoundVolume
} from './ui-sounds.js';

const PANEL_ID = 'wf-cheat-panel';
const PANEL_VERSION = '9';

function panelIsCurrent(panel) {
  return (
    panel?.dataset.panelVersion === PANEL_VERSION &&
    panel.querySelector('[data-skin]') &&
    panel.querySelector('[data-corporate-appearance]') &&
    panel.querySelector('[data-module-layout]') &&
    panel.querySelector('[data-music-volume]') &&
    panel.querySelector('[data-hover-sound-volume]')
  );
}

function isLauncherHome() {
  return Boolean(document.getElementById('home'));
}

function homePageUrl() {
  const path = window.location.pathname;
  if (/\/(workflow-intro|flow-map)\//.test(path)) return '../index.html';
  return 'index.html';
}

function navigateHome() {
  if (isLauncherHome()) return;

  window.location.href = homePageUrl();
}

function ensurePanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panelIsCurrent(panel)) return panel;
  panel?.remove();
  panel = buildPanel();
  wirePanel(panel);
  syncPanelUi(panel);
  return panel;
}

export function toggleCheatPanel() {
  const panel = ensurePanel();
  if (!panel) return;
  setPanelOpen(panel, !panel.classList.contains('is-open'));
}

function buildPanel() {
  const existing = document.getElementById(PANEL_ID);
  if (panelIsCurrent(existing)) return existing;
  existing?.remove();

  const panel = document.createElement('aside');
  panel.id = PANEL_ID;
  panel.dataset.panelVersion = PANEL_VERSION;
  panel.className = 'cheat-panel';
  panel.setAttribute('aria-label', 'Prototype cheat panel');
  panel.hidden = true;

  const state = getThemeState();
  const presets = state.skin === 'corporate' ? getCorporateThemePresets() : getThemePresets();
  const showHome = !isLauncherHome();
  const showPathReset = /\/(workflow-intro|flow-map)\//.test(window.location.pathname);

  panel.innerHTML = `
    ${
      showHome
        ? `<div class="cheat-panel__nav">
      <button type="button" class="cheat-panel__home" data-cheat-home>← Back to prototypes</button>
    </div>`
        : ''
    }
    <header class="cheat-panel__header">
      <h2 class="cheat-panel__title">Cheat panel</h2>
      <button type="button" class="cheat-panel__close" data-cheat-close aria-label="Close">×</button>
    </header>

    <section class="cheat-panel__section" aria-labelledby="cheat-skins-label">
      <span class="cheat-panel__label" id="cheat-skins-label">Skins</span>
      <div class="cheat-panel__segmented" role="group" aria-label="Prototype skin">
        ${SKINS.map(
          (skin) =>
            `<button type="button" class="cheat-panel__seg-btn" data-skin="${skin.id}">${skin.label}</button>`
        ).join('')}
      </div>
    </section>

    <section class="cheat-panel__section cheat-panel__section--nested" data-cheat-space-appearance aria-labelledby="cheat-space-appearance-label" hidden>
      <span class="cheat-panel__label" id="cheat-space-appearance-label">Space appearance</span>
      <div class="cheat-panel__segmented" role="group" aria-label="Dark space or light void">
        <button type="button" class="cheat-panel__seg-btn" data-appearance="dark">Dark · Space</button>
        <button type="button" class="cheat-panel__seg-btn" data-appearance="light">Light · Void</button>
      </div>
    </section>

    <section class="cheat-panel__section cheat-panel__section--nested" data-cheat-corporate-appearance aria-labelledby="cheat-corporate-appearance-label" hidden>
      <span class="cheat-panel__label" id="cheat-corporate-appearance-label">Corporate appearance</span>
      <div class="cheat-panel__segmented" role="group" aria-label="Image hero or colour theme">
        ${CORPORATE_APPEARANCES.map(
          (mode) =>
            `<button type="button" class="cheat-panel__seg-btn" data-corporate-appearance="${mode.id}">${mode.label}</button>`
        ).join('')}
      </div>
    </section>

    ${
      showPathReset
        ? `<section class="cheat-panel__section" aria-labelledby="cheat-module-layout-label">
      <span class="cheat-panel__label" id="cheat-module-layout-label">Module view</span>
      <div class="cheat-panel__segmented" role="group" aria-label="Module card layout">
        ${MODULE_LAYOUTS.map(
          (layout) =>
            `<button type="button" class="cheat-panel__seg-btn" data-module-layout="${layout.id}">${layout.label}</button>`
        ).join('')}
      </div>
      <p class="cheat-panel__sound-note">Folder bento: tab shows branch direction; label appears after you play a module.</p>
    </section>`
        : ''
    }

    <section class="cheat-panel__section" data-cheat-theme-color aria-labelledby="cheat-theme-label">
      <span class="cheat-panel__label" id="cheat-theme-label">Primary colour</span>
      <p class="cheat-panel__sound-note" data-cheat-theme-note hidden></p>
      <div class="cheat-panel__color-row">
        <input type="color" class="cheat-panel__color-input" data-theme-color-input value="${normalizeHex(state.themeColor)}" aria-label="Pick theme colour" />
        <input type="text" class="cheat-panel__color-hex" data-theme-color-hex value="${normalizeHex(state.themeColor)}" spellcheck="false" aria-label="Theme colour hex" />
      </div>
      <div class="cheat-panel__swatches" role="list" aria-label="Theme presets">
        ${presets
          .map(
            (hex) =>
              `<button type="button" class="cheat-panel__swatch" data-theme-preset="${hex}" style="background:${hex}" aria-label="Theme ${hex}"></button>`
          )
          .join('')}
      </div>
    </section>

    <section class="cheat-panel__section" aria-labelledby="cheat-music-label">
      <span class="cheat-panel__label" id="cheat-music-label">Background music</span>
      <div class="cheat-panel__segmented" role="group" aria-label="Background music on or muted">
        <button type="button" class="cheat-panel__seg-btn" data-music="on">On</button>
        <button type="button" class="cheat-panel__seg-btn" data-music="muted">Muted</button>
      </div>
      <label class="cheat-panel__volume" for="cheat-music-volume">
        <span class="cheat-panel__volume-label">Volume</span>
        <input
          type="range"
          class="cheat-panel__volume-slider"
          id="cheat-music-volume"
          data-music-volume
          min="0"
          max="100"
          step="1"
          value="${getMusicVolumePercent()}"
        />
        <span class="cheat-panel__volume-value" data-music-volume-label>${getMusicVolumePercent()}%</span>
      </label>
    </section>

    <section class="cheat-panel__section" aria-labelledby="cheat-hover-sound-label">
      <span class="cheat-panel__label" id="cheat-hover-sound-label">Module hover sound</span>
      <div class="cheat-panel__segmented cheat-panel__segmented--compact" role="group" aria-label="Hover sound pick mode">
        <button type="button" class="cheat-panel__seg-btn" data-hover-sound-mode="random">Random pick</button>
        <button type="button" class="cheat-panel__seg-btn" data-hover-sound-mode="single">Same each time</button>
      </div>
      <div class="cheat-panel__sound-grid" role="group" aria-label="Hover sound category">
        ${HOVER_SOUND_CATEGORIES.map(
          (cat) =>
            `<button type="button" class="cheat-panel__sound-btn" data-hover-sound="${cat.id}">${cat.label}</button>`
        ).join('')}
      </div>
      <label class="cheat-panel__volume" for="cheat-hover-sound-volume">
        <span class="cheat-panel__volume-label">Volume</span>
        <input
          type="range"
          class="cheat-panel__volume-slider"
          id="cheat-hover-sound-volume"
          data-hover-sound-volume
          min="0"
          max="100"
          step="1"
          value="${getHoverSoundVolumePercent()}"
        />
        <span class="cheat-panel__volume-value" data-hover-sound-volume-label>${getHoverSoundVolumePercent()}%</span>
      </label>
      <p class="cheat-panel__sound-note">Random: new file from the category on every hover. Same: one fixed file per category.</p>
    </section>
    ${
      showPathReset
        ? `<section class="cheat-panel__section" aria-labelledby="cheat-path-label">
      <span class="cheat-panel__label" id="cheat-path-label">Path progress</span>
      <div class="cheat-panel__path-actions">
        <button type="button" class="cheat-panel__reset-path" data-unlock-all-progress>Unlock all chapters</button>
        <button type="button" class="cheat-panel__reset-path" data-reset-progress>Reset unlocked modules</button>
      </div>
    </section>`
        : ''
    }
  `;

  document.body.appendChild(panel);
  return panel;
}

function syncPanelUi(panel) {
  const state = getThemeState();
  const color = normalizeHex(state.themeColor);

  panel.querySelectorAll('[data-skin]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.skin === state.skin);
  });

  const spaceAppearanceSection = panel.querySelector('[data-cheat-space-appearance]');
  if (spaceAppearanceSection) {
    spaceAppearanceSection.hidden = state.skin !== 'space';
  }

  const corporateAppearanceSection = panel.querySelector('[data-cheat-corporate-appearance]');
  if (corporateAppearanceSection) {
    corporateAppearanceSection.hidden = state.skin !== 'corporate';
  }

  panel.querySelectorAll('[data-appearance]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.appearance === state.appearance);
  });

  panel.querySelectorAll('[data-corporate-appearance]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.corporateAppearance === state.corporateAppearance);
  });

  const themeColorSection = panel.querySelector('[data-cheat-theme-color]');
  if (themeColorSection) {
    themeColorSection.hidden = false;
  }
  const themeNote = panel.querySelector('[data-cheat-theme-note]');
  if (themeNote) {
    if (state.skin === 'corporate') {
      themeNote.hidden = false;
      themeNote.textContent =
        state.corporateAppearance === 'color'
          ? 'Drives the hero gradient, volume nav, cords, and accents. Lighter and darker stops are derived automatically.'
          : 'Drives accents, buttons, borders, and path cords. The hero photo stays the same.';
    } else {
      themeNote.hidden = true;
    }
  }

  const colorInput = panel.querySelector('[data-theme-color-input]');
  const colorHex = panel.querySelector('[data-theme-color-hex]');
  if (colorInput) colorInput.value = color;
  if (colorHex) colorHex.value = color;

  panel.querySelectorAll('[data-theme-preset]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.themePreset === color);
  });

  const muted = isMusicMuted();
  panel.querySelectorAll('[data-music]').forEach((btn) => {
    btn.classList.toggle('is-active', muted ? btn.dataset.music === 'muted' : btn.dataset.music === 'on');
  });

  const volumePct = getMusicVolumePercent();
  const volumeSlider = panel.querySelector('[data-music-volume]');
  const volumeLabel = panel.querySelector('[data-music-volume-label]');
  if (volumeSlider) {
    volumeSlider.value = String(volumePct);
    volumeSlider.disabled = muted;
  }
  if (volumeLabel) volumeLabel.textContent = `${volumePct}%`;

  const hoverSound = getHoverSoundCategory();
  panel.querySelectorAll('[data-hover-sound]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.hoverSound === hoverSound);
  });

  const hoverMode = getHoverSoundMode();
  panel.querySelectorAll('[data-hover-sound-mode]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.hoverSoundMode === hoverMode);
  });

  const hoverOff = hoverSound === 'off';
  const hoverVolumePct = getHoverSoundVolumePercent();
  const hoverVolumeSlider = panel.querySelector('[data-hover-sound-volume]');
  const hoverVolumeLabel = panel.querySelector('[data-hover-sound-volume-label]');
  if (hoverVolumeSlider) {
    hoverVolumeSlider.value = String(hoverVolumePct);
    hoverVolumeSlider.disabled = hoverOff;
  }
  if (hoverVolumeLabel) hoverVolumeLabel.textContent = `${hoverVolumePct}%`;

  const moduleLayout = getModuleLayout();
  panel.querySelectorAll('[data-module-layout]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.moduleLayout === moduleLayout);
  });
}

function setPanelOpen(panel, open) {
  panel.classList.toggle('is-open', open);
  panel.hidden = !open;
}

const CHEAT_PANEL_TRIGGERS =
  '.intro-chapter, .intro-corporate-board__title, .intro-corporate-nav__item[data-volume="1"]';

/** Hidden trigger: Volume 1 nav, chapter title, space intro chapter (no affordance in UI). */
export function wireSecretChapterTrigger() {
  document.querySelectorAll(CHEAT_PANEL_TRIGGERS).forEach((el) => {
    if (el.dataset.cheatTrigger === '1') return;
    el.dataset.cheatTrigger = '1';
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleCheatPanel();
    });
  });
}

function rebuildThemePresets(panel) {
  const state = getThemeState();
  const presets = state.skin === 'corporate' ? getCorporateThemePresets() : getThemePresets();
  const swatches = panel.querySelector('.cheat-panel__swatches');
  if (!swatches) return;
  swatches.innerHTML = presets
    .map(
      (hex) =>
        `<button type="button" class="cheat-panel__swatch" data-theme-preset="${hex}" style="background:${hex}" aria-label="Theme ${hex}"></button>`
    )
    .join('');
  swatches.querySelectorAll('[data-theme-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = getThemeState();
      applyTheme({ ...next, themeColor: btn.dataset.themePreset });
      syncPanelUi(panel);
    });
  });
  syncPanelUi(panel);
}

function wirePanel(panel) {
  panel.querySelector('[data-cheat-home]')?.addEventListener('click', () => {
    setPanelOpen(panel, false);
    navigateHome();
  });

  panel.querySelector('[data-cheat-close]')?.addEventListener('click', () => setPanelOpen(panel, false));

  panel.querySelectorAll('[data-skin]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const state = getThemeState();
      applyTheme({ ...state, skin: btn.dataset.skin });
      syncPanelUi(panel);
      rebuildThemePresets(panel);
    });
  });

  panel.querySelectorAll('[data-appearance]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const state = getThemeState();
      applyTheme({ ...state, appearance: btn.dataset.appearance });
      syncPanelUi(panel);
    });
  });

  panel.querySelectorAll('[data-corporate-appearance]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const state = getThemeState();
      applyTheme({ ...state, corporateAppearance: btn.dataset.corporateAppearance });
      syncPanelUi(panel);
      rebuildThemePresets(panel);
    });
  });

  const colorInput = panel.querySelector('[data-theme-color-input]');
  const colorHex = panel.querySelector('[data-theme-color-hex]');

  colorInput?.addEventListener('input', () => {
    const state = getThemeState();
    applyTheme({ ...state, themeColor: colorInput.value });
    syncPanelUi(panel);
  });

  colorHex?.addEventListener('change', () => {
    const state = getThemeState();
    applyTheme({ ...state, themeColor: colorHex.value });
    syncPanelUi(panel);
  });

  panel.querySelectorAll('[data-theme-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const state = getThemeState();
      applyTheme({ ...state, themeColor: btn.dataset.themePreset });
      syncPanelUi(panel);
    });
  });

  window.addEventListener('wf-theme-change', () => syncPanelUi(panel));

  panel.querySelectorAll('[data-module-layout]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyModuleLayout(btn.dataset.moduleLayout);
      syncPanelUi(panel);
    });
  });

  window.addEventListener('wf-module-layout-change', () => syncPanelUi(panel));

  panel.querySelectorAll('[data-music]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setMusicMuted(btn.dataset.music === 'muted');
      syncPanelUi(panel);
    });
  });

  const volumeSlider = panel.querySelector('[data-music-volume]');
  const volumeLabel = panel.querySelector('[data-music-volume-label]');
  volumeSlider?.addEventListener('input', () => {
    const pct = Number(volumeSlider.value);
    if (volumeLabel) volumeLabel.textContent = `${pct}%`;
    setMusicVolume(pct / 100);
  });

  window.addEventListener('wf-music-change', () => syncPanelUi(panel));

  panel.querySelectorAll('[data-hover-sound-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setHoverSoundMode(btn.dataset.hoverSoundMode);
      syncPanelUi(panel);
    });
  });

  panel.querySelectorAll('[data-hover-sound]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setHoverSoundCategory(btn.dataset.hoverSound);
      syncPanelUi(panel);
    });
  });

  const hoverVolumeSlider = panel.querySelector('[data-hover-sound-volume]');
  const hoverVolumeLabel = panel.querySelector('[data-hover-sound-volume-label]');
  hoverVolumeSlider?.addEventListener('input', () => {
    const pct = Number(hoverVolumeSlider.value);
    if (hoverVolumeLabel) hoverVolumeLabel.textContent = `${pct}%`;
    setHoverSoundVolume(pct / 100);
  });

  window.addEventListener('wf-hover-sound-change', () => syncPanelUi(panel));

  panel.querySelector('[data-unlock-all-progress]')?.addEventListener('click', () => {
    unlockAllConsequenceProgress();
  });

  panel.querySelector('[data-reset-progress]')?.addEventListener('click', () => {
    resetConsequenceProgress();
  });
}

function onPageShow(event) {
  if (!event.persisted) return;
  const panel = document.getElementById(PANEL_ID);
  if (!panelIsCurrent(panel)) {
    panel?.remove();
    const fresh = buildPanel();
    wirePanel(fresh);
    syncPanelUi(fresh);
    wireSecretChapterTrigger();
  }
}

export function initCheatPanel() {
  initTheme();
  initModuleLayout();
  initAmbientMusicSync();
  initModuleCardSounds();
  const panel = ensurePanel();
  wireSecretChapterTrigger();
  window.addEventListener('pageshow', onPageShow);
}

initCheatPanel();

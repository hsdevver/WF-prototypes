import { getChapterCapsLabel } from './consequence-flow.js';

export const STORAGE_MODULE_LAYOUT = 'wf-proto-module-layout';
export const DEFAULT_MODULE_LAYOUT = 'clean';

export const MODULE_LAYOUTS = [
  { id: 'clean', label: 'Clean bento' },
  { id: 'folder', label: 'Folder bento' }
];

function normalizeLayout(layout) {
  return layout === 'folder' ? 'folder' : 'clean';
}

export function getModuleLayout() {
  return normalizeLayout(localStorage.getItem(STORAGE_MODULE_LAYOUT) || DEFAULT_MODULE_LAYOUT);
}

export function applyModuleLayout(layout = getModuleLayout()) {
  const id = normalizeLayout(layout);
  document.documentElement.dataset.moduleLayout = id;
  localStorage.setItem(STORAGE_MODULE_LAYOUT, id);

  const payload = { type: 'wf-module-layout', moduleLayout: id };
  window.dispatchEvent(new CustomEvent('wf-module-layout-change', { detail: payload }));

  document.querySelectorAll('iframe').forEach((frame) => {
    try {
      frame.contentWindow?.postMessage(payload, '*');
    } catch {
      /* cross-origin */
    }
  });

  return id;
}

export function initModuleLayout() {
  applyModuleLayout();

  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'wf-module-layout') return;
    applyModuleLayout(event.data.moduleLayout);
  });

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_MODULE_LAYOUT) applyModuleLayout();
  });
}

const HUB_ROW = 2;

/**
 * Folder tab edge hints from grid position + recorded play direction.
 * @param {{ id: string, row: number, column: number, start?: boolean, completed?: boolean, locked?: boolean, lastChoice?: string | null, lastDirection?: string | null }} mod
 */
export function getModuleFolderMeta(mod) {
  let direction = mod.lastDirection || null;

  if (!direction) {
    if (mod.start) direction = 'start';
    else if (mod.row < HUB_ROW) direction = 'up';
    else if (mod.row > HUB_ROW) direction = 'down';
    else if (mod.column >= 4) direction = 'right';
    else direction = 'neutral';
  }

  const decision =
    mod.completed && mod.lastChoice ? String(mod.lastChoice) : null;

  return { direction, decision };
}

/**
 * Wrap thumb + optional decision in folder chrome when layout is folder-bento.
 */
export function refreshFolderChrome(card, mod) {
  if (!card.classList.contains('module-card--folder')) return;
  const meta = getModuleFolderMeta(mod);
  card.dataset.folderDir = meta.direction;

  let decision = card.querySelector('.module-folder-decision');
  if (meta.decision) {
    if (!decision) {
      decision = document.createElement('p');
      decision.className = 'module-folder-decision';
      card.appendChild(decision);
    }
    decision.textContent = meta.decision;
  } else {
    decision?.remove();
  }
}

export function applyFolderChrome(card, mod) {
  if (getModuleLayout() !== 'folder') return;

  if (card.classList.contains('module-card--folder')) {
    refreshFolderChrome(card, mod);
    return;
  }

  const meta = getModuleFolderMeta(mod);
  card.classList.add('module-card--folder');
  card.dataset.folderDir = meta.direction;

  const tab = document.createElement('span');
  tab.className = 'module-folder-tab';
  tab.setAttribute('aria-hidden', 'true');

  const body = document.createElement('div');
  body.className = 'module-folder-body';

  const thumb = card.querySelector('.module-thumb');
  if (thumb) {
    card.removeChild(thumb);
    body.appendChild(thumb);
  }

  card.prepend(tab);
  card.insertBefore(body, tab.nextSibling);

  if (meta.decision) {
    const decision = document.createElement('p');
    decision.className = 'module-folder-decision';
    decision.textContent = meta.decision;
    card.appendChild(decision);
  }
}

export function createModuleThumbLabel(mod) {
  const label = document.createElement('div');
  label.className = 'module-thumb__label';

  const chapter = document.createElement('p');
  chapter.className = 'module-thumb__chapter';
  chapter.textContent = getChapterCapsLabel(mod);
  label.appendChild(chapter);

  const name = document.createElement('p');
  name.className = 'module-thumb__name';
  name.textContent = mod.title ?? '';
  name.hidden = Boolean(mod.locked);
  label.appendChild(name);

  return label;
}

export function syncModuleThumbLabel(card, mod) {
  const chapterEl = card.querySelector('.module-thumb__chapter');
  const nameEl = card.querySelector('.module-thumb__name');
  if (chapterEl) chapterEl.textContent = getChapterCapsLabel(mod);
  if (nameEl) {
    nameEl.textContent = mod.title ?? '';
    nameEl.hidden = Boolean(mod.locked);
  }
}

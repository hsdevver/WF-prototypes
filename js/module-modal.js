import { getChapterCapsLabel } from './consequence-flow.js';
import { recordPlayActivity } from './intro-activity-log.js';
import { applyPlayOutcome, getPlayScenario } from './consequence-progress.js';
import { playModuleHoverClick } from './ui-sounds.js';

const CORPORATE_PATH_INSET = 0.05;

const modalState = {
  open: false,
  moduleId: null,
  sourceCard: null,
  mod: null,
  view: 'detail',
  onClose: null,
  onProgress: null,
  onPlugWire: null,
  corporatePathLayout: false
};

let corporateResizeListener = null;

let rootEl = null;
let panelEl = null;
let backdropEl = null;
let closeBtn = null;
let backBtn = null;
let ctaBtn = null;
let heroImg = null;
let badgeEl = null;
let titleEl = null;
let descEl = null;
let statsEl = null;
let detailBlock = null;
let playBlock = null;
let playPromptEl = null;
let choicesEl = null;
let actionsEl = null;

function defaultModalMeta(mod) {
  return {
    badge: mod.start ? 'INTRO' : 'MODULE',
    cta: mod.start ? 'Play volume' : 'Play module',
    showStats: Boolean(mod.completed && mod.lastChoice),
    lastChoice: mod.lastChoice ?? '—',
    playtime: mod.completed ? '12 min' : '—',
    bestRun: mod.progress > 0 ? `${mod.progress}%` : mod.completed ? '100%' : '—'
  };
}

function modalMeta(mod) {
  return { ...defaultModalMeta(mod), ...(mod.modal ?? {}) };
}

function ensureDom() {
  if (rootEl) return;

  rootEl = document.createElement('div');
  rootEl.id = 'module-modal';
  rootEl.className = 'module-modal';
  rootEl.hidden = true;

  backdropEl = document.createElement('button');
  backdropEl.type = 'button';
  backdropEl.className = 'module-modal__backdrop';
  backdropEl.setAttribute('aria-label', 'Close dialog');

  panelEl = document.createElement('div');
  panelEl.className = 'module-modal__panel';
  panelEl.setAttribute('role', 'dialog');
  panelEl.setAttribute('aria-modal', 'true');
  panelEl.setAttribute('aria-labelledby', 'module-modal-title');

  closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'module-modal__close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = '&times;';

  const hero = document.createElement('div');
  hero.className = 'module-modal__hero';
  heroImg = document.createElement('img');
  heroImg.className = 'module-modal__hero-img';
  heroImg.alt = '';
  hero.appendChild(heroImg);

  const body = document.createElement('div');
  body.className = 'module-modal__body';

  detailBlock = document.createElement('div');
  detailBlock.className = 'module-modal__detail';

  badgeEl = document.createElement('span');
  badgeEl.className = 'module-modal__badge';

  titleEl = document.createElement('h2');
  titleEl.className = 'module-modal__title';
  titleEl.id = 'module-modal-title';

  descEl = document.createElement('p');
  descEl.className = 'module-modal__desc';

  statsEl = document.createElement('dl');
  statsEl.className = 'module-modal__stats';
  for (const [label, key] of [
    ['Your last choice', 'lastChoice'],
    ['Playtime', 'playtime'],
    ['Best run', 'bestRun']
  ]) {
    const wrap = document.createElement('div');
    wrap.className = 'module-modal__stat';
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.dataset.stat = key;
    wrap.append(dt, dd);
    statsEl.appendChild(wrap);
  }

  detailBlock.append(badgeEl, titleEl, descEl, statsEl);

  playBlock = document.createElement('div');
  playBlock.className = 'module-modal__play';
  playBlock.hidden = true;

  playPromptEl = document.createElement('p');
  playPromptEl.className = 'module-modal__play-prompt';

  choicesEl = document.createElement('div');
  choicesEl.className = 'module-modal__choices';

  playBlock.append(playPromptEl, choicesEl);

  actionsEl = document.createElement('div');
  actionsEl.className = 'module-modal__actions';

  backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'module-modal__back';
  backBtn.textContent = 'Back';

  ctaBtn = document.createElement('button');
  ctaBtn.type = 'button';
  ctaBtn.className = 'module-modal__cta';

  actionsEl.append(backBtn, ctaBtn);
  body.append(detailBlock, playBlock, actionsEl);
  panelEl.append(closeBtn, hero, body);
  rootEl.append(backdropEl, panelEl);
  document.body.appendChild(rootEl);

  backdropEl.addEventListener('click', () => closeModuleModal());
  closeBtn.addEventListener('click', () => closeModuleModal());
  backBtn.addEventListener('click', () => onBackClick());
  ctaBtn.addEventListener('click', () => onCtaClick());

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalState.open) closeModuleModal();
  });
}

function setView(view) {
  modalState.view = view;
  panelEl.dataset.view = view;

  detailBlock.hidden = view !== 'detail';
  playBlock.hidden = view !== 'choices';
  ctaBtn.hidden = false;
  backBtn.hidden = false;
}

function isCorporateSkin() {
  return document.documentElement.dataset.skin === 'corporate';
}

function getCorporatePathHost() {
  return document.getElementById('intro-path-map');
}

function getCorporatePathColumns() {
  return document.getElementById('intro-columns');
}

function rectWithinHost(host, el) {
  const hostRect = host.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return {
    left: elRect.left - hostRect.left,
    top: elRect.top - hostRect.top,
    width: elRect.width,
    height: elRect.height
  };
}

function corporatePanelTargetRectFromColumns() {
  const host = getCorporatePathHost();
  const columns = getCorporatePathColumns();
  if (!host || !columns) return null;

  const col = columns.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  const padX = col.width * CORPORATE_PATH_INSET;
  const padY = col.height * CORPORATE_PATH_INSET;

  return {
    left: col.left - hostRect.left + padX,
    top: col.top - hostRect.top + padY,
    width: Math.max(col.width - padX * 2, 120),
    height: Math.max(col.height - padY * 2, 160)
  };
}

/** Panel frame matches the clicked module cell (inner card + outer wrap share one box). */
function corporatePanelTargetRect(sourceCard) {
  const host = getCorporatePathHost();
  const wrap = sourceCard?.closest('.intro-module-wrap');
  if (host && wrap) return rectWithinHost(host, wrap);
  return corporatePanelTargetRectFromColumns();
}

function applyCorporatePanelFrame(target) {
  if (!panelEl || !target) return;
  panelEl.style.position = 'absolute';
  panelEl.style.left = `${target.left}px`;
  panelEl.style.top = `${target.top}px`;
  panelEl.style.width = `${target.width}px`;
  panelEl.style.height = `${target.height}px`;
  panelEl.style.maxWidth = 'none';
  panelEl.style.maxHeight = 'none';
  panelEl.style.margin = '0';
}

function clearCorporatePanelFrame() {
  if (!panelEl) return;
  for (const prop of ['position', 'left', 'top', 'width', 'height', 'maxWidth', 'maxHeight', 'margin']) {
    panelEl.style[prop] = '';
  }
}

function mountCorporatePathModal() {
  const host = getCorporatePathHost();
  if (!host || !rootEl) return false;
  if (rootEl.parentElement !== host) host.appendChild(rootEl);
  rootEl.classList.add('module-modal--corporate-path');
  return true;
}

function unmountCorporatePathModal() {
  if (!rootEl) return;
  rootEl.classList.remove('module-modal--corporate-path');
  if (rootEl.parentElement !== document.body) document.body.appendChild(rootEl);
}

function bindCorporateResize() {
  if (corporateResizeListener) return;
  corporateResizeListener = () => {
    if (!modalState.open || !modalState.corporatePathLayout) return;
    const target = corporatePanelTargetRect(modalState.sourceCard);
    if (!target) return;
    applyCorporatePanelFrame(target);
  };
  window.addEventListener('resize', corporateResizeListener);
}

function unbindCorporateResize() {
  if (!corporateResizeListener) return;
  window.removeEventListener('resize', corporateResizeListener);
  corporateResizeListener = null;
}

function corporateOriginWrap(sourceCard) {
  return sourceCard?.closest('.intro-module-wrap') ?? sourceCard;
}

function runCorporatePathOpen(sourceCard) {
  const host = getCorporatePathHost();
  const target = corporatePanelTargetRect(sourceCard);
  if (!host || !target) {
    modalState.corporatePathLayout = false;
    sourceCard.classList.add('is-modal-source');
    runFlipOpen(sourceCard);
    return;
  }

  mountCorporatePathModal();
  modalState.corporatePathLayout = true;
  bindCorporateResize();

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const origin = rectWithinHost(host, corporateOriginWrap(sourceCard));

  rootEl.classList.add('is-visible');
  rootEl.hidden = false;
  applyCorporatePanelFrame(target);

  if (reduced) {
    panelEl.style.transition = '';
    panelEl.style.transform = '';
    return;
  }

  const dx = origin.left - target.left;
  const dy = origin.top - target.top;
  const sx = origin.width / target.width;
  const sy = origin.height / target.height;

  panelEl.style.transition = 'none';
  panelEl.style.transformOrigin = 'top left';
  panelEl.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panelEl.style.transition = 'transform 0.5s cubic-bezier(0.16, 0.92, 0.18, 1)';
      panelEl.style.transform = '';
    });
  });
}

function runCorporatePathClose(onDone) {
  const host = getCorporatePathHost();
  const sourceCard = modalState.sourceCard;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!host || !sourceCard || !modalState.corporatePathLayout || reduced) {
    onDone();
    return;
  }

  const target = corporatePanelTargetRect(sourceCard);
  if (!target) {
    onDone();
    return;
  }

  applyCorporatePanelFrame(target);
  const origin = rectWithinHost(host, corporateOriginWrap(sourceCard));
  const dx = origin.left - target.left;
  const dy = origin.top - target.top;
  const sx = origin.width / target.width;
  const sy = origin.height / target.height;

  panelEl.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
  panelEl.style.transformOrigin = 'top left';
  panelEl.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

  const onEnd = () => {
    panelEl.removeEventListener('transitionend', onEnd);
    onDone();
  };
  panelEl.addEventListener('transitionend', onEnd);
  window.setTimeout(onEnd, 450);
}

function populatePanel(mod, imageUrl) {
  const meta = modalMeta(mod);
  const scenario = getPlayScenario(mod.id);
  const chapterLabel = getChapterCapsLabel(mod);

  heroImg.src = imageUrl;
  badgeEl.textContent = isCorporateSkin() && chapterLabel ? chapterLabel : meta.badge;
  titleEl.textContent = mod.title;
  descEl.textContent = mod.description;
  ctaBtn.textContent = scenario ? meta.cta : 'Close';

  statsEl.classList.toggle('is-hidden', !meta.showStats);
  if (meta.showStats) {
    statsEl.querySelector('[data-stat="lastChoice"]').textContent = meta.lastChoice ?? '—';
    statsEl.querySelector('[data-stat="playtime"]').textContent = meta.playtime ?? '—';
    statsEl.querySelector('[data-stat="bestRun"]').textContent = meta.bestRun ?? '—';
  }

  panelEl.style.setProperty('--module-hue', String(mod.hue ?? 205));
  setView('detail');
}

function onOutcomePick(outcome) {
  playModuleHoverClick({ bypassThrottle: true });

  if (outcome.plugWire && modalState.onPlugWire) {
    const { mod, sourceCard, onPlugWire } = modalState;
    closeModuleModal(() => {
      onPlugWire(mod, outcome, sourceCard);
    });
    return;
  }

  const { mod, onProgress } = modalState;
  const newlyUnlocked = applyPlayOutcome(mod.id, outcome);
  recordPlayActivity(mod, outcome, newlyUnlocked);
  closeModuleModal(() => {
    onProgress?.(newlyUnlocked, mod.id);
  });
}

function showChoices(scenario) {
  playPromptEl.textContent = scenario.choicesPrompt;
  choicesEl.innerHTML = '';

  for (const outcome of scenario.outcomes) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const dir = outcome.direction ? ` module-modal__choice--${outcome.direction}` : '';
    btn.className = `module-modal__choice${dir}`;

    if (outcome.direction) {
      const dirEl = document.createElement('span');
      dirEl.className = 'module-modal__choice-dir';
      dirEl.setAttribute('aria-hidden', 'true');
      dirEl.textContent = outcome.direction === 'up' ? '↑' : '↓';
      btn.appendChild(dirEl);
    }

    const labelEl = document.createElement('span');
    labelEl.className = 'module-modal__choice-label';
    labelEl.textContent = outcome.label;
    btn.appendChild(labelEl);

    if (outcome.hint) {
      const hintEl = document.createElement('span');
      hintEl.className = 'module-modal__choice-hint';
      hintEl.textContent = outcome.hint;
      btn.appendChild(hintEl);
    }

    btn.addEventListener('click', () => onOutcomePick(outcome));
    choicesEl.appendChild(btn);
  }

  setView('choices');
}

function onCtaClick() {
  const scenario = getPlayScenario(modalState.mod?.id);
  if (!scenario) {
    closeModuleModal();
    return;
  }
  playModuleHoverClick({ bypassThrottle: true });
  showChoices(scenario);
}

function onBackClick() {
  if (modalState.view === 'choices') {
    setView('detail');
    return;
  }
  closeModuleModal();
}

function runFlipOpen(sourceCard) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const first = sourceCard.getBoundingClientRect();

  panelEl.style.transition = 'none';
  panelEl.style.transformOrigin = 'top left';
  rootEl.classList.add('is-visible');
  rootEl.hidden = false;

  const last = panelEl.getBoundingClientRect();
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const sx = first.width / last.width;
  const sy = first.height / last.height;

  if (reduced) {
    panelEl.style.transform = '';
    panelEl.style.transition = '';
    return;
  }

  panelEl.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panelEl.style.transition = 'transform 0.48s cubic-bezier(0.16, 0.92, 0.18, 1)';
      panelEl.style.transform = '';
    });
  });
}

function runFlipClose(onDone) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sourceCard = modalState.sourceCard;

  if (!sourceCard || reduced || !panelEl) {
    onDone();
    return;
  }

  const first = panelEl.getBoundingClientRect();
  const last = sourceCard.getBoundingClientRect();
  const dx = last.left - first.left;
  const dy = last.top - first.top;
  const sx = last.width / first.width;
  const sy = last.height / first.height;

  panelEl.style.transition = 'transform 0.38s cubic-bezier(0.4, 0, 0.2, 1)';
  panelEl.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

  const onEnd = () => {
    panelEl.removeEventListener('transitionend', onEnd);
    onDone();
  };
  panelEl.addEventListener('transitionend', onEnd);
  window.setTimeout(onEnd, 420);
}

/**
 * @param {object} mod — runtime module
 * @param {HTMLElement} sourceCard
 * @param {{ imageUrl?: string, onClose?: () => void, onProgress?: (unlockedIds: string[], moduleId: string) => void, onPlugWire?: (mod: object, outcome: object, sourceCard: HTMLElement) => void }} [options]
 */
export function openModuleModal(mod, sourceCard, options = {}) {
  if (!mod || !sourceCard || modalState.open) return;

  ensureDom();
  populatePanel(mod, options.imageUrl ?? sourceCard.querySelector('img')?.src ?? '');

  modalState.open = true;
  modalState.moduleId = mod.id;
  modalState.mod = mod;
  modalState.sourceCard = sourceCard;
  modalState.onClose = options.onClose ?? null;
  modalState.onProgress = options.onProgress ?? null;
  modalState.onPlugWire = options.onPlugWire ?? null;

  sourceCard.setAttribute('aria-expanded', 'true');
  document.documentElement.classList.add('is-module-modal-open');

  if (isCorporateSkin() && mountCorporatePathModal()) {
    const originWrap = corporateOriginWrap(sourceCard);
    originWrap?.classList.add('is-modal-origin');
    runCorporatePathOpen(sourceCard);
  } else {
    modalState.corporatePathLayout = false;
    sourceCard.classList.add('is-modal-source');
    runFlipOpen(sourceCard);
  }

  closeBtn.focus();
}

export function closeModuleModal(afterClose) {
  if (!modalState.open) return;

  const { sourceCard, onClose } = modalState;
  const done = typeof afterClose === 'function' ? afterClose : onClose;

  const finish = () => {
    rootEl.classList.remove('is-visible');
    rootEl.hidden = true;
    panelEl.style.transition = '';
    panelEl.style.transform = '';
    clearCorporatePanelFrame();
    unmountCorporatePathModal();
    unbindCorporateResize();
    document.documentElement.classList.remove('is-module-modal-open');

    if (sourceCard) {
      sourceCard.classList.remove('is-modal-source', 'is-modal-origin');
      corporateOriginWrap(sourceCard)?.classList.remove('is-modal-origin');
      sourceCard.removeAttribute('aria-expanded');
    }

    modalState.open = false;
    modalState.moduleId = null;
    modalState.mod = null;
    modalState.sourceCard = null;
    modalState.onClose = null;
    modalState.onProgress = null;
    modalState.onPlugWire = null;
    modalState.corporatePathLayout = false;
    setView('detail');
    done?.();
  };

  if (modalState.corporatePathLayout) {
    runCorporatePathClose(finish);
    return;
  }

  rootEl.classList.remove('is-visible');
  runFlipClose(finish);
}

export function isModuleModalOpen() {
  return modalState.open;
}

export function initModuleModal() {
  ensureDom();
}

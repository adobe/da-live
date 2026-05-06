import { loadStyle } from '../../shared/nxutils.js';

const style = await loadStyle(import.meta.url);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];

export const SPLIT_RATIO_STORAGE_KEY = 'nx-canvas-split-ratio';

const SPLIT_RATIO_MIN = 0.15;
const SPLIT_RATIO_MAX = 0.85;
const SPLIT_GUTTER_PX = 2;

const SPLIT_MOUNT_CLASS = 'nx-canvas-editor-mount-split';
const SPLIT_GUTTER_CLASS = 'nx-canvas-split-gutter';

function readPersistedSplitRatio() {
  try {
    const v = Number.parseFloat(sessionStorage.getItem(SPLIT_RATIO_STORAGE_KEY), 10);
    if (Number.isFinite(v) && v >= SPLIT_RATIO_MIN && v <= SPLIT_RATIO_MAX) return v;
  } catch {
    /* ignore */
  }
  return 0.5;
}

function persistSplitRatio(ratio) {
  try {
    sessionStorage.setItem(SPLIT_RATIO_STORAGE_KEY, String(ratio));
  } catch {
    /* ignore */
  }
}

function clampSplitRatio(ratio) {
  return Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, ratio));
}

/** Toggle split row on the mount; seed `--nx-canvas-split-ratio` when entering split mode. */
export function syncEditorSplitLayout({ mountRoot, view }) {
  mountRoot.classList.toggle(SPLIT_MOUNT_CLASS, view === 'split');
  if (view !== 'split') return;
  const cur = mountRoot.style.getPropertyValue('--nx-canvas-split-ratio').trim();
  if (!cur) {
    mountRoot.style.setProperty('--nx-canvas-split-ratio', String(readPersistedSplitRatio()));
  }
}

export function removeSplitGutter(mountRoot) {
  mountRoot.querySelector(`.${SPLIT_GUTTER_CLASS}`)?.remove();
}

function ensureSplitGutter(mountRoot) {
  let g = mountRoot.querySelector(`.${SPLIT_GUTTER_CLASS}`);
  if (!g) {
    g = document.createElement('div');
    g.className = SPLIT_GUTTER_CLASS;
    g.setAttribute('role', 'separator');
    g.setAttribute('aria-orientation', 'vertical');
    g.setAttribute('aria-label', 'Resize split between preview and editor');
    g.tabIndex = -1;
    mountRoot.append(g);
  }
  return g;
}

/** WYSIWYG (left), 2px gutter, doc (right) — safe if other nodes exist in the mount. */
export function finalizeSplitEditorMountOrder(mountRoot) {
  const doc = mountRoot.querySelector('nx-editor-doc');
  const wyg = mountRoot.querySelector('nx-editor-wysiwyg');
  if (!doc || !wyg) return;
  const g = ensureSplitGutter(mountRoot);
  mountRoot.append(wyg);
  mountRoot.append(g);
  mountRoot.append(doc);
}

function splitRatioFromPointer(mountRoot, clientX) {
  const rect = mountRoot.getBoundingClientRect();
  const inner = rect.width - SPLIT_GUTTER_PX;
  if (inner <= 0) return 0.5;
  return clampSplitRatio((clientX - rect.left) / inner);
}

/** Pointer-drag on the split gutter; persists ratio under {@link SPLIT_RATIO_STORAGE_KEY}. */
export function installEditorSplitDrag(mountRoot) {
  if (mountRoot.dataset.nxSplitDragInstalled) return;
  mountRoot.dataset.nxSplitDragInstalled = '1';

  mountRoot.addEventListener('pointerdown', (e) => {
    if (!mountRoot.classList.contains(SPLIT_MOUNT_CLASS)) return;
    const gutter = e.target?.closest?.(`.${SPLIT_GUTTER_CLASS}`);
    if (!gutter || !mountRoot.contains(gutter)) return;
    e.preventDefault();
    gutter.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      const ratio = splitRatioFromPointer(mountRoot, ev.clientX);
      mountRoot.style.setProperty('--nx-canvas-split-ratio', String(ratio));
    };

    const onUp = () => {
      try {
        gutter.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore if already released */
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const raw = mountRoot.style.getPropertyValue('--nx-canvas-split-ratio').trim();
      const ratio = clampSplitRatio(Number.parseFloat(raw, 10) || readPersistedSplitRatio());
      mountRoot.style.setProperty('--nx-canvas-split-ratio', String(ratio));
      persistSplitRatio(ratio);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
}

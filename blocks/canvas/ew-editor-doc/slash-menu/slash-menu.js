/* eslint-disable import/no-unresolved -- importmap */
import { Plugin } from 'da-y-wrapper';
import { getNx } from '../../../../scripts/utils.js';
import {
  slashMenuItemsForQuery,
  applySlashSelection,
  cellSelectionSlashItems,
} from '../../editor-utils/command-defs.js';
import { ensureBlockLibrary } from '../../editor-utils/block-slash.js';
import {
  ensureBlockOptions,
  blockOptionItems,
  isBlockOption,
  applyBlockOption,
} from './block-options.js';

await import(`${getNx()}/blocks/shared/menu/menu.js`);
const { hashChange } = await import(`${getNx()}/utils/utils.js`);

function inTopLevelParagraph($from) {
  if ($from.parent.type.name !== 'paragraph') return false;
  if ($from.depth < 1) return false;
  return $from.node($from.depth - 1).type.name === 'doc';
}

/** 'block' for a top-level paragraph (block insert), 'cell' inside a block cell (options). */
function paragraphMode($from) {
  if ($from.parent.type.name !== 'paragraph' || $from.depth < 1) return null;
  const parentType = $from.node($from.depth - 1).type.name;
  if (parentType === 'doc') return 'block';
  if (parentType === 'table_cell') return 'cell';
  return null;
}

export function getSlashContext(state) {
  const { $from } = state.selection;
  const mode = paragraphMode($from);
  if (!mode) return null;

  const paraStart = $from.start();
  const head = state.selection.from;
  if (head <= paraStart) return null;

  const prefix = state.doc.textBetween(paraStart, head, '\ufffc', '\ufffc');
  const slashIndex = prefix.lastIndexOf('/');
  if (slashIndex === -1) return null;

  if (slashIndex > 0) {
    if (mode !== 'cell') return null;
    if (!prefix.slice(0, slashIndex).trimEnd().endsWith(',')) return null;
  }

  const query = prefix.slice(slashIndex + 1);
  if (query.length > 50) return null;

  return { query, anchorPos: paraStart + slashIndex, mode };
}

// A CellSelection (one or more selected table cells) carries `$anchorCell`;
// text and node selections do not. Used to offer the merge/split slash menu.
export function hasCellSelection(state) {
  return !!state.selection.$anchorCell;
}

function shouldShowSlashHint(state) {
  const { $from } = state.selection;
  return (
    inTopLevelParagraph($from)
    && $from.parentOffset === 0
    && $from.parent.content.size === 0
    && !getSlashContext(state)
  );
}

function setup(container, view, ctxRef) {
  const anchor = document.createElement('span');
  anchor.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
  container.append(anchor);

  const menu = document.createElement('nx-menu');
  menu.ignoreFocus = true;
  menu.scoped = true;
  menu.items = slashMenuItemsForQuery('');
  container.append(menu);

  menu.addEventListener('select', (e) => {
    const { state } = view;
    // Cell-selection mode has no "/query" text to strip - just run the command.
    if (ctxRef.cellMode) {
      ctxRef.cellMode = false;
      menu.close();
      applySlashSelection(view, e.detail.id);
      view.focus();
      return;
    }
    const slash = getSlashContext(state);
    if (slash) {
      const { anchorPos } = slash;
      const head = state.selection.from;
      view.dispatch(state.tr.delete(anchorPos, head));
      if (isBlockOption(e.detail.id)) {
        applyBlockOption(view, e.detail.id);
      } else {
        applySlashSelection(view, e.detail.id);
      }
    }
    view.focus();
  });

  const scrollEl = container.closest('.ew-editor-doc');
  const onScroll = () => { if (menu.open) menu.reposition(); };
  scrollEl?.addEventListener('scroll', onScroll, { passive: true });

  return { menu, anchor, scrollEl, onScroll };
}

function positionAnchor(view, anchor, pos) {
  const coords = view.coordsAtPos(pos);
  const rect = anchor.offsetParent.getBoundingClientRect();
  anchor.style.left = `${coords.left - rect.left}px`;
  anchor.style.top = `${coords.bottom - rect.top}px`;
}

function syncSlashHint(view, ctxRef) {
  const container = view.dom.parentElement;
  if (!container) return;

  if (!shouldShowSlashHint(view.state)) {
    if (ctxRef.hintEl) ctxRef.hintEl.style.display = 'none';
    return;
  }

  if (!ctxRef.hintEl) {
    const hint = document.createElement('span');
    hint.textContent = 'Tap \'/\' to insert';
    hint.setAttribute('aria-hidden', 'true');
    hint.className = 'da-slash-hint';
    container.append(hint);
    ctxRef.hintEl = hint;
  }

  const { hintEl } = ctxRef;
  const pos = view.state.selection.$from.start();
  const coords = view.coordsAtPos(pos);
  const containerRect = container.getBoundingClientRect();
  hintEl.style.left = `${coords.left - containerRect.left + 3}px`;
  hintEl.style.top = `${coords.top - containerRect.top}px`;
  hintEl.style.display = '';
}

function syncSlashUi(view, ctxRef) {
  // The cell menu is driven from handleKeyDown; skip the text-prefix flow while
  // it's active, dismissing it only once the cell selection is gone.
  if (ctxRef.cellMode) {
    if (!hasCellSelection(view.state)) {
      ctxRef.cellMode = false;
      ctxRef.ctx?.menu.close();
    }
    return;
  }

  syncSlashHint(view, ctxRef);

  const container = view.dom.parentElement;
  if (!container) return;

  const slash = getSlashContext(view.state);

  if (!slash) {
    ctxRef.ctx?.menu.close();
    return;
  }

  // In a block cell, offer that block's key/value options; at the top level, the
  // block-insert / text commands. Both load their data on demand.
  let items;
  if (slash.mode === 'cell') {
    const pending = ensureBlockOptions(ctxRef.orgSite);
    if (pending) pending.then(() => syncSlashUi(view, ctxRef));
    items = blockOptionItems(view.state, slash.query);
  } else {
    const pending = ensureBlockLibrary(ctxRef.orgSite);
    if (pending) pending.then(() => syncSlashUi(view, ctxRef));
    items = slashMenuItemsForQuery(slash.query);
  }

  if (!items || !items.length) {
    ctxRef.ctx?.menu.close();
    return;
  }

  if (!ctxRef.ctx) ctxRef.ctx = setup(container, view, ctxRef);
  const { menu, anchor } = ctxRef.ctx;
  positionAnchor(view, anchor, slash.anchorPos);
  menu.items = items;
  if (!menu.open) {
    menu.show({ anchor, placement: 'auto' });
  }
}

function openCellSlashMenu(view, ctxRef, items) {
  const container = view.dom.parentElement;
  if (!container) return;
  if (!ctxRef.ctx) ctxRef.ctx = setup(container, view, ctxRef);
  ctxRef.cellMode = true;
  const { menu, anchor } = ctxRef.ctx;
  positionAnchor(view, anchor, view.state.selection.from);
  menu.items = items;
  if (!menu.open) menu.show({ anchor, placement: 'auto' });
}

function destroySlashUi(ctxRef) {
  ctxRef.cellMode = false;
  ctxRef.hintEl?.remove();
  ctxRef.hintEl = null;
  const { ctx } = ctxRef;
  if (!ctx) return;
  ctx.menu.close();
  ctx.scrollEl?.removeEventListener('scroll', ctx.onScroll);
  ctx.anchor.remove();
  ctx.menu.remove();
  ctxRef.ctx = null;
}

export function createSlashMenuPlugin() {
  const ctxRef = {};

  return new Plugin({
    view(editorView) {
      const unsubHash = hashChange.subscribe((s) => {
        ctxRef.orgSite = s ? { org: s.org, site: s.site } : undefined;
      });

      const onKeyDown = () => {
        syncSlashUi(editorView, ctxRef);
      };
      editorView.dom.addEventListener('keydown', onKeyDown);

      return {
        update(editorView_) {
          // Paste, collab, pointer, and any transaction not preceded by this DOM keydown path
          syncSlashUi(editorView_, ctxRef);
        },
        destroy() {
          editorView.dom.removeEventListener('keydown', onKeyDown);
          unsubHash?.();
          destroySlashUi(ctxRef);
        },
      };
    },
    props: {
      handleKeyDown(view, event) {
        const { ctx } = ctxRef;
        if (ctx?.menu.open) {
          const keys = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'];
          if (!keys.includes(event.key)) return false;
          ctx.menu.handleKey(event.key);
          // Escape (and Enter, via select) closes the menu; leave cell mode too.
          if (!ctx.menu.open) ctxRef.cellMode = false;
          return true;
        }
        // Classic-editor parity: pressing "/" on a multi-cell selection opens the
        // merge/split menu (without typing a "/") so cells can be merged by keyboard.
        if (event.key === '/' && hasCellSelection(view.state)) {
          const items = cellSelectionSlashItems(view.state);
          if (!items.length) return false;
          event.preventDefault();
          openCellSlashMenu(view, ctxRef, items);
          return true;
        }
        return false;
      },
    },
  });
}

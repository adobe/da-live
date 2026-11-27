/* eslint-disable import/no-unresolved -- importmap */
import { DOMParser as PMDOMParser, DOMSerializer } from 'da-y-wrapper';
import prose2aem from '../../shared/prose2aem.js';
import { getNx } from '../../../scripts/utils.js';
import { TOOL_PANEL_SECTION } from '../../shared/tool-panel/tool-panel-section.js';
import { htmlToProse } from '../../edit/utils/helpers.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { getExtensionsBridge } from './extensions-bridge.js';
import {
  getBlockPositions,
  getTableBlockName,
  replaceBlockRange,
  resolveBlockPosition,
  setBlockSelection,
} from './blocks.js';
import {
  loadBlockOperators,
  loadOperatorModule,
  normalizeBlockName,
} from '../ew-panel-extensions/helpers.js';

/**
 * Block operators: JS modules configured per block name (`property: operator` in the block
 * library's "editor" sheet) that take over a block's authoring. This is DA's host: one
 * operator instance per operator block (keyed by block index), the `ctx` it receives, the
 * block-index commit, and editor-selection sync. The outline mounts `outline` through
 * `mountOutline`.
 */

const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);

const SYNC_DELAY_MS = 100;

/** Chat context key prefix for an operator's entry (`ctx.setChatContext`). */
export const OPERATOR_CHAT_KEY = 'block-operator-item';

const chatKeyFor = (blockIndex) => `${OPERATOR_CHAT_KEY}:${blockIndex}`;

function clearChatContext(blockIndex) {
  const detail = { key: chatKeyFor(blockIndex) };
  document.dispatchEvent(new CustomEvent(CHAT_EVENT.ADD_TO_CHAT, { detail }));
}

/** Tool panel view ids are extension titles, lowercased with spaces as dashes. */
export function toPanelId(nameOrId) {
  return String(nameOrId ?? '').trim().toLowerCase().replaceAll(' ', '-');
}

function openToolPanel(nameOrId) {
  const id = toPanelId(nameOrId);
  if (!id) return false;
  const detail = { section: TOOL_PANEL_SECTION, id };
  document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail }));
  return true;
}

/** A block table node as EDS block markup: `<div class="name variant"><div><div>…`. */
export function blockNodeToHtml(node, schema) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tableWrapper';
  wrapper.append(DOMSerializer.fromSchema(schema).serializeNode(node));
  return prose2aem(wrapper, false, true).trim();
}

/** The block name (first class) and variant (remaining classes) of EDS block markup. */
function blockIdentity(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const classes = [...(doc.body.firstElementChild?.classList ?? [])];
  return { name: classes[0] ?? '', variant: classes.slice(1).join(', ') };
}

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

/** Convert EDS block markup to editor DOM, requiring exactly one block named `name`. */
function blockHtmlToDom(html, name, schema) {
  if (typeof html !== 'string' || !html.trim()) fail('INVALID_HTML', 'Block HTML is required.');
  const input = new DOMParser().parseFromString(html, 'text/html');
  const elements = [...input.body.children];
  const target = normalizeBlockName(name);
  if (elements.length !== 1 || !elements[0].matches('div[class]')
    || normalizeBlockName(elements[0].classList[0]) !== target) {
    fail('INVALID_HTML', `The HTML must be exactly one "${name}" block.`);
  }
  const converted = htmlToProse(`<main><div>${elements[0].outerHTML}</div></main>`);
  const { dom } = converted;
  converted.ydoc.destroy();
  // aem2doc adds empty paragraphs around block tables for caret insertion.
  dom.querySelectorAll(':scope > p:empty').forEach((el) => el.remove());
  const parsed = PMDOMParser.fromSchema(schema).parse(dom);
  const table = parsed.firstChild;
  if (parsed.childCount !== 1 || table?.type.name !== 'table'
    || normalizeBlockName(getTableBlockName(table)) !== target) {
    fail('INVALID_HTML', `The HTML must be exactly one "${name}" block.`);
  }
  return dom;
}

export function createBlockOperatorHost({
  getView = () => getExtensionsBridge().view,
  loadOperators = loadBlockOperators,
  loadModule = loadOperatorModule,
} = {}) {
  let key = null;
  let generation = 0;
  let operators = new Map();
  const records = new Map();
  let unsubscribes = [];
  let syncTimer;

  const notifyInstance = (blockIndex) => canvasBus.blockOperatorInstanceState.emit({ blockIndex });

  function dropChatContext(record, blockIndex) {
    if (!record.hasChat) return;
    record.hasChat = false;
    clearChatContext(blockIndex);
  }

  // ctx.setChatContext: the operator's own chat entry for this block. da-live adds only
  // what the operator can't know (block identity, position and the current selection).
  function setChatContext(record, blockIndex, item) {
    if (records.get(blockIndex) !== record || record.status !== 'ready') return false;
    if (item == null) {
      dropChatContext(record, blockIndex);
      return true;
    }
    const view = getView();
    const start = view && getBlockPositions(view)[blockIndex];
    if (typeof item !== 'object' || start == null) return false;
    const { from, to } = view.state.selection;
    const inBlock = from > start && to < start + view.state.doc.nodeAt(start).nodeSize;
    const entryKey = chatKeyFor(blockIndex);
    record.hasChat = true;
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.ADD_TO_CHAT, {
      detail: {
        key: entryKey,
        id: entryKey,
        label: item.label,
        innerText: item.innerText,
        pinnable: item.pinnable,
        type: 'block',
        blockName: record.ctx.name,
        proseIndex: start + 1,
        selectionType: inBlock ? 'text' : 'block',
        selFrom: inBlock ? from : start,
        selTo: inBlock ? to : start + view.state.doc.nodeAt(start).nodeSize,
      },
    }));
    return true;
  }

  function unmountAll(record) {
    record.mounts.forEach((handle) => {
      try { handle?.unmount?.(); } catch { /* the instance is going away anyway */ }
    });
    record.mounts.clear();
  }

  function destroyRecord(blockIndex) {
    const record = records.get(blockIndex);
    if (!record) return;
    records.delete(blockIndex);
    unmountAll(record);
    dropChatContext(record, blockIndex);
    try { record.instance?.destroy?.(); } catch { /* ignore */ }
    record.instance = null;
    if (record.status === 'ready') notifyInstance(blockIndex);
  }

  function failRecord(record, blockIndex, error) {
    // eslint-disable-next-line no-console
    console.warn(`[block-operators] ${record.url} failed for block ${blockIndex}; using the default behaviour.`, error);
    if (records.get(blockIndex) !== record) return;
    const wasReady = record.status === 'ready';
    unmountAll(record);
    dropChatContext(record, blockIndex);
    try { record.instance?.destroy?.(); } catch { /* ignore */ }
    record.instance = null;
    record.status = 'failed';
    if (wasReady) notifyInstance(blockIndex);
  }

  // Runs operator code for a record; a throw drops the operator for that block.
  function guard(record, blockIndex, fn, fallback = undefined) {
    try {
      return fn();
    } catch (error) {
      failRecord(record, blockIndex, error);
      return fallback;
    }
  }

  // ctx.select: the operator's locate, then a caret at that position.
  function selectItem(blockIndex, itemId) {
    const record = records.get(blockIndex);
    const view = getView();
    if (record?.status !== 'ready' || itemId == null || !view) return false;
    const locate = () => record.instance.locate?.(itemId) ?? null;
    const position = guard(record, blockIndex, locate, null);
    return position ? setBlockSelection(view, blockIndex, position) : false;
  }

  // ctx.commit: replace the operator's own block, only if it still matches `expected`.
  async function commit(blockIndex, html, { expected, name }) {
    try {
      const view = getView();
      if (!view) fail('NO_EDITOR', 'No editor is open.');
      if (!view.editable) fail('NOT_EDITABLE', 'The document is read-only.');
      const { schema } = view.state;
      const start = getBlockPositions(view)[blockIndex];
      if (start == null) fail('STALE', 'The block no longer exists.');
      const node = view.state.doc.nodeAt(start);
      const current = blockNodeToHtml(node, schema);
      if (current !== expected) {
        fail('STALE', 'The block changed since the operator last saw it.');
      }
      const dom = blockHtmlToDom(html, name, schema);
      replaceBlockRange(view, start, start + node.nodeSize, dom);
    } catch (error) {
      return { ok: false, error: error.code || 'INVALID_HTML', message: error.message };
    }
    // eslint-disable-next-line no-use-before-define
    sync();
    return { ok: true };
  }

  function createCtx(record, blockIndex, html, editable) {
    const ctx = {
      ...blockIdentity(html),
      blockIndex,
      html,
      editable,
      commit: (next) => commit(blockIndex, next, { expected: ctx.html, name: ctx.name }),
      select: (itemId) => selectItem(blockIndex, itemId),
      openPanel: openToolPanel,
      setChatContext: (item) => setChatContext(record, blockIndex, item),
      onEditorSelect: (cb) => {
        if (typeof cb !== 'function') return () => {};
        record.listeners.add(cb);
        return () => record.listeners.delete(cb);
      },
    };
    return ctx;
  }

  function createRecord(blockIndex, name, url, node, view) {
    const record = {
      url,
      name,
      node,
      status: 'loading',
      instance: null,
      itemId: null,
      listeners: new Set(),
      mounts: new Set(),
    };
    const html = blockNodeToHtml(node, view.state.schema);
    record.ctx = createCtx(record, blockIndex, html, !!view.editable);
    records.set(blockIndex, record);
    loadModule(url).then((operator) => {
      if (records.get(blockIndex) !== record) return;
      const { name: blockName, variant } = record.ctx;
      if (typeof operator.matches === 'function' && !operator.matches({ name: blockName, variant })) {
        record.status = 'none';
        return;
      }
      const instance = operator.create(record.ctx);
      if (!instance || typeof instance !== 'object') throw new Error('create() returned no instance');
      record.instance = instance;
      record.status = 'ready';
      notifyInstance(blockIndex);
      // eslint-disable-next-line no-use-before-define
      notifySelection();
    }).catch((error) => failRecord(record, blockIndex, error));
  }

  function refreshRecord(record, blockIndex, node, view) {
    const editable = !!view.editable;
    if (record.node === node && record.ctx.editable === editable) return;
    record.node = node;
    const html = blockNodeToHtml(node, view.state.schema);
    if (html === record.ctx.html && editable === record.ctx.editable) return;
    Object.assign(record.ctx, blockIdentity(html), { html, editable });
    if (record.status === 'ready') guard(record, blockIndex, () => record.instance.update?.(record.ctx));
  }

  function sync() {
    clearTimeout(syncTimer);
    syncTimer = undefined;
    const view = getView();
    if (!view || !operators.size) {
      [...records.keys()].forEach(destroyRecord);
      return;
    }
    const { doc } = view.state;
    const positions = getBlockPositions(view);
    positions.forEach((pos, blockIndex) => {
      const node = doc.nodeAt(pos);
      const name = normalizeBlockName(getTableBlockName(node));
      const url = operators.get(name);
      let record = records.get(blockIndex);
      const replaced = record && (record.url !== url || record.name !== name
        || (record.status === 'none' && record.node !== node));
      if (replaced) {
        destroyRecord(blockIndex);
        record = undefined;
      }
      if (!url) return;
      if (!record) createRecord(blockIndex, name, url, node, view);
      else if (record.status === 'failed') record.node = node;
      else refreshRecord(record, blockIndex, node, view);
    });
    [...records.keys()].filter((i) => i >= positions.length).forEach(destroyRecord);
  }

  function scheduleSync() {
    if (!operators.size) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, SYNC_DELAY_MS);
  }

  // ctx.onEditorSelect: the selected item (the operator's resolve) of the block holding
  // the caret; null for every other block.
  function notifySelection() {
    const view = getView();
    const hit = view && resolveBlockPosition(view);
    records.forEach((record, blockIndex) => {
      if (record.status !== 'ready') return;
      const itemId = hit?.blockIndex === blockIndex && hit.position
        ? guard(record, blockIndex, () => record.instance.resolve?.(hit.position) ?? null, null)
        : null;
      if (record.itemId === itemId) return;
      record.itemId = itemId;
      record.listeners.forEach((cb) => {
        try { cb(itemId); } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('[block-operators] onEditorSelect callback failed', error);
        }
      });
    });
  }

  function detach() {
    generation += 1;
    key = null;
    unsubscribes.forEach((off) => off());
    unsubscribes = [];
    clearTimeout(syncTimer);
    syncTimer = undefined;
    [...records.keys()].forEach(destroyRecord);
    operators = new Map();
  }

  async function attach({ org, site } = {}) {
    const nextKey = org && site ? `${org}/${site}` : null;
    if (nextKey && nextKey === key) {
      scheduleSync();
      return;
    }
    detach();
    if (!nextKey) return;
    key = nextKey;
    const current = generation;
    let registry;
    try {
      registry = await loadOperators(org, site);
    } catch {
      registry = new Map();
    }
    // Sites without `operator` rows stay exactly as before: nothing subscribes or loads.
    if (current !== generation || !registry?.size) return;
    operators = registry;
    unsubscribes = [
      canvasBus.editorDocState.subscribe(scheduleSync),
      canvasBus.editorHtmlState.subscribe(scheduleSync),
      canvasBus.editorSelectState.subscribe(notifySelection),
    ];
    sync();
  }

  /** The block's ready operator instance, or null. */
  function getInstance(blockIndex) {
    const record = records.get(blockIndex);
    return record?.status === 'ready' ? record.instance : null;
  }

  /**
   * The `edit` hook, for the Layout toolbar's "Edit block": true when the operator handled
   * it; false (run the default) when there is no operator or hook, or it throws.
   */
  function edit(blockIndex) {
    const record = records.get(blockIndex);
    if (record?.status !== 'ready' || typeof record.instance.edit !== 'function') return false;
    return guard(record, blockIndex, () => record.instance.edit() === true, false);
  }

  /** Mount the block's `outline` contract in `container`; returns `{ unmount }` or null. */
  function mountOutline(blockIndex, container) {
    const record = records.get(blockIndex);
    if (record?.status !== 'ready' || typeof record.instance.outline?.mount !== 'function') return null;
    const handle = guard(record, blockIndex, () => record.instance.outline.mount(container), null);
    if (record.status !== 'ready') return null;
    record.mounts.add(handle);
    return {
      unmount() {
        if (!record.mounts.delete(handle)) return;
        guard(record, blockIndex, () => handle?.unmount?.());
      },
    };
  }

  return {
    attach,
    detach,
    sync,
    getInstance,
    edit,
    mountOutline,
  };
}

export const blockOperatorHost = createBlockOperatorHost();

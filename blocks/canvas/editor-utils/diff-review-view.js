import {
  Decoration,
  DecorationSet,
  DOMSerializer,
  Plugin,
  PluginKey,
} from 'da-y-wrapper';
import { getNx2 } from '../../../scripts/utils.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { getDiffLabels } from '../../edit/utils/helpers.js';
import { htmlDiff } from '../../shared/version/htmldiff.js';
import { applyResolution, getDiffEngine, loadDiffEngine } from '../../edit/prose/diff/diff-engine.js';
import { hasGroupedMarkup } from './diff-review.js';

const REASON_TEXT = {
  'no-baseline': 'Last rollout not available',
  'page-too-large': 'Last rollout not compared: the page is too large',
  'reviewing-open-markup': 'Last rollout not compared: the page had open review items',
};

const THREE_WAY = new Set(['both-changed', null, undefined]);
const BASE_LABEL = 'Last rollout';
const DIFF_KEY = 'da-review-diff';
const SHOW_KEY = 'da-review-show';
export const SHOW = Object.freeze({ source: 'source', both: 'both', local: 'local' });
const TEXT_LEAVES = new Set(['paragraph', 'heading', 'code_block']);
const TEXT_CONTAINERS = new Set(['blockquote', 'bullet_list', 'ordered_list', 'list_item']);
const MARKERS = new Set(['diff_added', 'diff_deleted']);
const ROLE = Object.freeze({ card: 'card', member: 'member', pending: 'pending' });
const rolesKey = new PluginKey('diffReviewRoles');

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice only lasts for this page.
  }
}

function readView() {
  const show = Object.values(SHOW).includes(read(SHOW_KEY)) ? read(SHOW_KEY) : SHOW.both;
  return { show, diff: read(DIFF_KEY) === 'true' };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function groupTitle({ sides = [], kinds = [], reason } = {}, labels = getDiffLabels()) {
  const { local, upstream } = labels;
  if (sides.length > 1) {
    return THREE_WAY.has(reason) ? `Changed in ${upstream} and ${local}` : `Different in ${upstream} and ${local}`;
  }
  if (sides[0] === 'source') return `Added in ${upstream}`;
  if (sides[0] === 'local') {
    return kinds.includes('removed') ? `Removed in ${upstream}, edited in ${local}` : `Added in ${local}`;
  }
  return '';
}

export function reasonText(reason) {
  return REASON_TEXT[reason] ?? '';
}

let controlsLoaded;
function loadControls() {
  controlsLoaded ??= Promise.resolve()
    .then(() => Promise.all([
      import(`${getNx2()}/blocks/shared/switch/switch.js`),
      import(`${getNx2()}/blocks/shared/segmented-btn/segmented.js`),
      import(`${getNx2()}/blocks/shared/menu/menu.js`),
    ]))
    .catch(() => {
      controlsLoaded = undefined;
    });
}

function roleOf(decorations = []) {
  return decorations.find((deco) => deco.spec?.diffRole)?.spec.diffRole;
}

function hiddenView(role) {
  const dom = el('span', 'diff-group-member');
  dom.hidden = true;
  return {
    dom,
    stopEvent: () => true,
    ignoreMutation: () => true,
    ...(role && { update: (node, decorations) => roleOf(decorations) === role }),
  };
}

const roleDecoration = ({ node, pos }, diffRole) => Decoration
  .node(pos, pos + node.nodeSize, {}, { diffRole });

function pendingDecorations(doc) {
  const decorations = [];
  doc.descendants((node, pos) => {
    if (!MARKERS.has(node.type.name)) return true;
    if (node.attrs.diffGroup) decorations.push(roleDecoration({ node, pos }, ROLE.pending));
    return false;
  });
  return decorations;
}

function roleDecorations(doc) {
  const engine = getDiffEngine();
  const decorations = engine
    ? engine.groups(doc).flatMap(({ markers }) => markers
      .map((marker, idx) => roleDecoration(marker, idx ? ROLE.member : ROLE.card)))
    : pendingDecorations(doc);
  return DecorationSet.create(doc, decorations);
}

export function createReviewPlugin() {
  return new Plugin({
    key: rolesKey,
    state: {
      init: (_, state) => roleDecorations(state.doc),
      apply: (tr, set, _, state) => (tr.docChanged || tr.getMeta(rolesKey)
        ? roleDecorations(state.doc) : set),
    },
    props: { decorations: (state) => rolesKey.getState(state) },
    view(editorView) {
      let destroyed = false;
      const load = (view) => {
        if (getDiffEngine() || !hasGroupedMarkup(view.state.doc)) return;
        loadDiffEngine().then(() => {
          if (!destroyed) view.dispatch(view.state.tr.setMeta(rolesKey, true).setMeta('addToHistory', false));
        }).catch(() => {});
      };
      load(editorView);
      return {
        update: load,
        destroy() {
          destroyed = true;
        },
      };
    },
  });
}

function serialize(schema, entries) {
  const serializer = DOMSerializer.fromSchema(schema);
  const frag = document.createDocumentFragment();
  entries.forEach(({ node }) => frag.append(serializer.serializeFragment(node.content)));
  return frag;
}

function isTextUnit(node) {
  if (TEXT_LEAVES.has(node.type.name)) return true;
  return TEXT_CONTAINERS.has(node.type.name) && node.content.content.every(isTextUnit);
}

function shapeOf(node) {
  if (node.type.name === 'table') return node.content.content.map((row) => row.childCount).join('x');
  return isTextUnit(node) ? '' : null;
}

const tableShapes = (entries) => entries.flatMap(({ node }) => node.content.content.map(shapeOf));

function canDiff(entries, reference) {
  const shapes = tableShapes(entries);
  if (!entries.length || shapes.includes(null)) return false;
  if (!reference.length) return true;
  const refShapes = tableShapes(reference);
  if (refShapes.includes(null)) return false;
  return shapes.filter(Boolean).join() === refShapes.filter(Boolean).join();
}

function toHtml(fragment) {
  const div = document.createElement('div');
  div.append(fragment);
  return div.innerHTML.replace(/ (?:da-diff-added|dadiffadded|data-id|dataid)="[^"]*"/g, '');
}

function diffView(before, after, label) {
  const diff = el('div', 'diff-group-side-diff');
  diff.setAttribute('role', 'group');
  diff.setAttribute('aria-label', label);
  diff.innerHTML = htmlDiff(before, after);
  diff.querySelectorAll('.diffmod, [data-diffmod]').forEach((node) => {
    node.title = node.matches('a[data-diffmod]') ? 'Link changed' : 'Formatting changed';
  });
  return diff;
}

function actionButton(label, choice, onChoose) {
  const { CHOICE } = getDiffEngine();
  const variant = choice === CHOICE.both ? 'nx-action-btn-quiet' : 'nx-action-btn';
  const button = el('button', `diff-group-action ${variant} nx-btn-sm is-choose-${choice}`);
  if (choice !== CHOICE.both) {
    const swatch = el('span', 'diff-group-action-swatch');
    swatch.setAttribute('aria-hidden', 'true');
    button.append(swatch);
  }
  button.append(el('span', '', label));
  button.type = 'button';
  button.addEventListener('click', () => onChoose(choice));
  return button;
}

function syncScrollFocus(side) {
  const scrolls = side.scrollWidth > side.clientWidth + 1;
  if (scrolls) side.tabIndex = 0;
  else side.removeAttribute('tabindex');
}

function focusAfterResolve(view, card) {
  const ids = [...view.dom.querySelectorAll('.diff-group-card')].map((c) => c.dataset.diffGroup);
  const at = ids.indexOf(card.dataset.diffGroup);
  return () => {
    const nextId = [ids[at + 1], ids[at - 1]].find((id) => id
      && view.dom.querySelector(`.diff-group-card[data-diff-group="${id}"]`));
    const next = nextId && view.dom.querySelector(`.diff-group-card[data-diff-group="${nextId}"]`);
    if (next) next.focus();
    else view.focus();
  };
}

class GroupCardView {
  constructor(node, view, getPos, decorations) {
    this.view = view;
    this.node = node;
    this.id = node.attrs.diffGroup;
    const role = roleOf(decorations);
    if (role !== ROLE.card) {
      Object.assign(this, hiddenView(role));
      return;
    }
    const { markers, bases } = getDiffEngine().findGroup(view.state.doc, this.id);
    this.dom = this.build(markers, bases);
    this.unsubscribe = canvasBus.diffReviewState.subscribe((detail) => {
      if (detail?.view === view) this.renderSummary(detail.summary);
    });
  }

  build(markers, bases) {
    const { CHOICE } = getDiffEngine();
    const { schema } = this.view.state;
    const labels = getDiffLabels();
    const card = el('div', 'diff-group-card');
    card.contentEditable = 'false';
    card.tabIndex = -1;
    card.dataset.diffGroup = this.id;
    card.setAttribute('role', 'group');
    const idBase = `diff-group-${this.id}`;
    card.setAttribute('aria-labelledby', `${idBase}-title`);

    const header = el('div', 'diff-group-header');
    this.titleEl = el('p', 'diff-group-title', groupTitle({
      sides: ['source', 'local'].filter((s) => markers.some(({ side }) => side === s)),
      kinds: markers.map(({ node }) => node.attrs.diffKind).filter(Boolean),
      reason: markers.map(({ node }) => node.attrs.diffReason).find(Boolean),
    }));
    this.titleEl.id = `${idBase}-title`;
    this.reasonEl = el('p', 'diff-group-reason');
    this.reasonEl.hidden = true;
    header.append(this.titleEl);
    card.append(header);

    const sides = el('div', 'diff-group-sides');
    const sourceEntries = markers.filter(({ side }) => side === 'source');
    const localEntries = markers.filter(({ side }) => side === 'local');
    const removed = markers.some(({ node }) => node.attrs.diffKind === 'removed');
    const emptyText = removed ? 'Removed' : 'Not present';
    const panes = [
      [sourceEntries, labels.upstream, 'is-source', localEntries, labels.local],
      [localEntries, labels.local, 'is-local', sourceEntries, labels.upstream],
    ];
    panes.forEach(([entries, label, cls, other, otherLabel]) => {
      const side = el('section', `diff-group-side ${cls}`);
      const chip = el('p', 'diff-group-side-label', label);
      chip.id = `${idBase}-${cls}`;
      side.setAttribute('role', 'group');
      side.setAttribute('aria-labelledby', chip.id);
      side.append(chip);
      if (!entries.length) {
        side.classList.add('is-empty');
        side.append(el('p', 'diff-group-side-empty', emptyText));
        sides.append(side);
        return;
      }
      const content = el('div', 'diff-group-side-content');
      content.append(serialize(schema, entries));
      side.append(content);
      const [reference, referenceLabel] = bases.length ? [bases, BASE_LABEL] : [other, otherLabel];
      if (canDiff(entries, reference)) {
        side.classList.add('has-diff');
        side.append(diffView(
          toHtml(serialize(schema, reference)),
          toHtml(serialize(schema, entries)),
          `Changes from ${referenceLabel} to ${label}`,
        ));
      }
      sides.append(side);
    });
    card.append(sides);
    this.sides = [...sides.children];
    this.resizeObserver = new ResizeObserver(() => this.sides.forEach(syncScrollFocus));
    this.sides.forEach((side) => this.resizeObserver.observe(side));

    const choose = (choice) => {
      const refocus = focusAfterResolve(this.view, card);
      applyResolution(this.view, 'resolve', { groupId: this.id, choice });
      refocus();
    };
    const actions = el('div', 'diff-group-actions');
    actions.append(
      actionButton(`Accept ${labels.upstream}`, CHOICE.source, choose),
      actionButton(`Preserve ${labels.local}`, CHOICE.mine, choose),
    );
    if (sourceEntries.length && localEntries.length) {
      actions.append(actionButton('Keep both', CHOICE.both, choose));
    }
    if (bases.length) {
      const details = el('details', 'diff-group-base');
      const summary = el('summary', '', BASE_LABEL);
      const body = el('div', 'diff-group-base-content');
      body.append(serialize(schema, bases));
      details.append(summary, body);
      card.append(details);
    }
    card.append(this.reasonEl, actions);
    return card;
  }

  renderSummary(summary) {
    this.sides?.forEach(syncScrollFocus);
    const group = summary?.groups?.find(({ id }) => id === this.id);
    if (!group) return;
    this.titleEl.textContent = groupTitle(group);
    this.reasonEl.textContent = reasonText(group.reason);
    this.reasonEl.hidden = !this.reasonEl.textContent;
  }

  update(node, decorations) {
    return node.eq(this.node) && roleOf(decorations) === ROLE.card;
  }

  stopEvent() {
    return true;
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.unsubscribe?.();
    this.resizeObserver?.disconnect();
  }
}

export function createReviewNodeViews(fallback) {
  const pick = (type) => (node, view, getPos, decorations) => (node.attrs.diffGroup
    ? new GroupCardView(node, view, getPos, decorations)
    : fallback[type](node, view, getPos));
  return {
    diff_added: pick('diff_added'),
    diff_deleted: pick('diff_deleted'),
    diff_base: () => hiddenView(),
  };
}

const bars = new WeakMap();

function focusGroup(view, id) {
  view.dom.querySelectorAll('.diff-group-card.is-current')
    .forEach((card) => card.classList.remove('is-current'));
  const card = view.dom.querySelector(`.diff-group-card[data-diff-group="${id}"]`);
  if (!card) return;
  card.classList.add('is-current');
  card.scrollIntoView({ block: 'center', behavior: 'smooth' });
  card.focus({ preventScroll: true });
}

function applyView(view, { show, diff }) {
  const host = view.dom.parentNode;
  if (!host) return;
  host.dataset.reviewShow = show;
  host.dataset.reviewDiff = String(diff);
}

function clearView(view) {
  const host = view.dom.parentNode;
  if (!host) return;
  delete host.dataset.reviewShow;
  delete host.dataset.reviewDiff;
}

function buildViewControls(view, labels) {
  loadControls();
  const current = readView();
  const showEl = el('nx-segmented-btn', 'diff-review-show');
  showEl.label = 'Show';
  showEl.items = [
    { value: SHOW.source, label: labels.upstream },
    { value: SHOW.local, label: labels.local },
    { value: SHOW.both, label: 'Both' },
  ];
  showEl.value = current.show;
  const diffEl = el('nx-switch', 'diff-review-diff');
  diffEl.setAttribute('size', 'sm');
  diffEl.setAttribute('label', 'Show diff');
  diffEl.checked = current.diff;
  const update = () => {
    const next = { show: showEl.value, diff: !!diffEl.checked };
    write(SHOW_KEY, next.show);
    write(DIFF_KEY, String(next.diff));
    applyView(view, next);
  };
  showEl.addEventListener('change', (e) => {
    showEl.value = e.detail?.value ?? showEl.value;
    update();
  });
  diffEl.addEventListener('change', (e) => {
    diffEl.checked = !!e.detail?.checked;
    update();
  });
  const group = el('div', 'diff-review-view');
  const labelEl = el('span', 'diff-review-view-label', 'Show');
  labelEl.setAttribute('aria-hidden', 'true');
  group.append(labelEl, showEl, diffEl);
  applyView(view, current);
  return group;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `/img/icons/s2-icon-${name}-20-n.svg#icon`);
  svg.append(use);
  return svg;
}

function iconButton(label, iconName, cls, onClick) {
  const b = el('button', `diff-review-btn nx-action-btn-icon nx-btn-sm ${cls}`);
  b.type = 'button';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.append(icon(iconName));
  b.addEventListener('click', onClick);
  return b;
}

function buildAcceptAll(view, labels) {
  const { CHOICE } = getDiffEngine();
  const menu = el('nx-menu', 'diff-review-accept-all');
  menu.setAttribute('placement', 'below-end');
  menu.items = [
    { id: CHOICE.source, label: `Accept all ${labels.upstream}` },
    { id: CHOICE.mine, label: `Preserve all ${labels.local}` },
  ];
  menu.addEventListener('select', (e) => {
    if (![CHOICE.source, CHOICE.mine].includes(e.detail?.id)) return;
    applyResolution(view, 'resolveAll', { choice: e.detail.id });
    view.focus();
  });
  const trigger = el('button', 'diff-review-btn nx-action-btn nx-btn-sm');
  trigger.type = 'button';
  trigger.slot = 'trigger';
  trigger.append(el('span', '', 'Resolve all'), icon('chevrondown'));
  menu.append(trigger);
  const wrap = el('div', 'diff-review-bulk');
  wrap.append(menu);
  return wrap;
}

function buildBar(view, state) {
  const bar = el('div', 'diff-review-bar');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Review conflicts');
  state.countEl = el('p', 'diff-review-count');
  state.countEl.setAttribute('aria-live', 'polite');
  const step = (delta) => {
    const ids = state.summary?.groups.map(({ id }) => id) ?? [];
    if (!ids.length) return;
    state.index = (state.index + delta + ids.length) % ids.length;
    focusGroup(view, ids[state.index]);
  };
  const labels = getDiffLabels();
  const nav = el('div', 'diff-review-nav');
  nav.append(
    iconButton('Previous conflict', 'chevronleft', 'is-prev', () => step(-1)),
    iconButton('Next conflict', 'chevronright', 'is-next', () => step(1)),
  );
  const position = el('div', 'diff-review-position');
  position.append(state.countEl, nav);
  bar.append(position, buildViewControls(view, labels), buildAcceptAll(view, labels));
  return bar;
}

export function renderReviewBar(view, summary) {
  let state = bars.get(view);
  if (!state) {
    state = { index: -1 };
    state.el = buildBar(view, state);
    bars.set(view, state);
  }
  state.summary = summary;
  const count = summary.groups.length;
  state.countEl.textContent = count === 1 ? '1 conflict' : `${count} conflicts`;
  if (state.index >= count) state.index = count - 1;
  if (!state.el.isConnected) view.dom.parentNode?.insertBefore(state.el, view.dom);
}

export function removeReviewBar(view) {
  clearView(view);
  bars.get(view)?.el.remove();
  bars.delete(view);
}

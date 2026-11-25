import { DOMSerializer } from 'da-y-wrapper';
import { canvasBus } from '../utils/canvas-bus.js';
import { getDiffLabels } from '../../edit/utils/helpers.js';
import { htmlDiff } from '../../shared/version/htmldiff.js';
import { CHOICE, findGroup, resolveAll, resolveGroup } from './diff-review.js';

const REASON_TEXT = {
  'both-changed': 'The source and this page both changed it since the last copy.',
  differs: 'The source and this page are different here.',
  'no-baseline': 'There is no record of the last copy, so all differences show.',
  'page-too-large': 'The page is too large to compare with the last copy, so all differences show.',
  'reviewing-open-markup': 'The page had open review items, so all differences show.',
};

const NO_ORIGINAL = 'The original is not available.';
const LAYOUT_KEY = 'da-review-layout';
const INLINE = 'inline';
const SIDE = 'side';
const TEXT_UNITS = new Set(['paragraph', 'heading', 'list_item']);

function readLayout() {
  try {
    return localStorage.getItem(LAYOUT_KEY) === INLINE ? INLINE : SIDE;
  } catch {
    return SIDE;
  }
}

function writeLayout(layout) {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // The choice only lasts for this page.
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function groupTitle({ sides = [], kinds = [] }) {
  if (sides.length > 1) return 'Source changed this · You changed it';
  if (sides[0] === 'source') return 'Source added this';
  if (sides[0] === 'local') {
    return kinds.includes('removed') ? 'You changed this · Source removed it' : 'You added this';
  }
  return '';
}

export function reasonText(reason) {
  return REASON_TEXT[reason] ?? '';
}

function hiddenView() {
  const dom = el('span', 'diff-group-member');
  dom.hidden = true;
  return {
    dom,
    stopEvent: () => true,
    ignoreMutation: () => true,
  };
}

function serialize(schema, entries) {
  const serializer = DOMSerializer.fromSchema(schema);
  const frag = document.createDocumentFragment();
  entries.forEach(({ node }) => frag.append(serializer.serializeFragment(node.content)));
  return frag;
}

const isTextSide = (entries) => entries.length > 0 && entries
  .every(({ node }) => node.content.content.every((unit) => TEXT_UNITS.has(unit.type.name)));

function toHtml(fragment) {
  const div = document.createElement('div');
  div.append(fragment);
  return div.innerHTML.replaceAll(' da-diff-added=""', '');
}

function setInline(card, inline) {
  card.classList.toggle('is-inline', inline);
  card.querySelector('.diff-group-layout')?.setAttribute('aria-pressed', String(inline));
}

function toolButton(label, className, onClick) {
  const button = el('button', `diff-group-tool ${className}`, label);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

function actionButton(label, choice, onChoose) {
  const button = el('button', `diff-group-action is-choose-${choice}`, label);
  button.type = 'button';
  button.addEventListener('click', () => onChoose(choice));
  return button;
}

class GroupCardView {
  constructor(node, view, getPos) {
    this.view = view;
    this.id = node.attrs.diffGroup;
    const { markers, bases } = findGroup(view.state.doc, this.id);
    if (markers[0]?.pos !== getPos()) {
      Object.assign(this, hiddenView());
      return;
    }
    this.dom = this.build(markers, bases);
    this.unsubscribe = canvasBus.diffReviewState.subscribe((detail) => {
      if (detail?.view === view) this.renderSummary(detail.summary);
    });
  }

  build(markers, bases) {
    const { schema } = this.view.state;
    const labels = getDiffLabels();
    const card = el('div', 'diff-group-card');
    card.contentEditable = 'false';
    card.tabIndex = -1;
    card.dataset.diffGroup = this.id;

    const header = el('div', 'diff-group-header');
    this.titleEl = el('p', 'diff-group-title', groupTitle({
      sides: ['source', 'local'].filter((s) => markers.some(({ side }) => side === s)),
      kinds: markers.map(({ node }) => node.attrs.diffKind).filter(Boolean),
    }));
    this.reasonEl = el('p', 'diff-group-reason');
    const text = el('div', 'diff-group-heading');
    text.append(this.titleEl, this.reasonEl);
    const tools = el('div', 'diff-group-tools');
    header.append(text, tools);
    card.append(header);

    if (bases.length) {
      const details = el('details', 'diff-group-base');
      this.baseSummaryEl = el('summary', '', 'Was');
      const body = el('div', 'diff-group-base-content');
      body.append(serialize(schema, bases));
      details.append(this.baseSummaryEl, body);
      card.append(details);
    }
    this.hasBase = bases.length > 0;

    const sides = el('div', 'diff-group-sides');
    const sourceEntries = markers.filter(({ side }) => side === 'source');
    const localEntries = markers.filter(({ side }) => side === 'local');
    [[sourceEntries, labels.upstream, 'is-source'], [localEntries, labels.local, 'is-local']]
      .filter(([entries]) => entries.length)
      .forEach(([entries, label, cls]) => {
        const side = el('section', `diff-group-side ${cls}`);
        side.append(el('p', 'diff-group-side-label', label));
        const content = el('div', 'diff-group-side-content');
        content.tabIndex = 0;
        content.setAttribute('role', 'region');
        content.setAttribute('aria-label', label);
        content.append(serialize(schema, entries));
        side.append(content);
        sides.append(side);
      });
    card.append(sides);

    if (isTextSide(sourceEntries) && isTextSide(localEntries)) {
      card.classList.add('can-inline');
      const inline = el('div', 'diff-group-inline');
      inline.tabIndex = 0;
      inline.setAttribute('role', 'region');
      inline.setAttribute('aria-label', `Changes from ${labels.upstream} to ${labels.local}`);
      inline.innerHTML = htmlDiff(
        toHtml(serialize(schema, sourceEntries)),
        toHtml(serialize(schema, localEntries)),
      );
      const legend = el('p', 'diff-group-legend', `Struck out: only in ${labels.upstream}. Highlighted: only in ${labels.local}.`);
      card.append(legend, inline);
      const layout = toolButton('Inline view', 'diff-group-layout', () => {
        const next = card.classList.contains('is-inline') ? SIDE : INLINE;
        writeLayout(next);
        this.view.dom.querySelectorAll('.diff-group-card.can-inline')
          .forEach((other) => setInline(other, next === INLINE));
      });
      tools.append(layout);
      setInline(card, readLayout() === INLINE);
    }

    const expand = toolButton('Expand', 'diff-group-expand', () => {
      const expanded = card.classList.toggle('is-expanded');
      expand.textContent = expanded ? 'Collapse' : 'Expand';
      expand.setAttribute('aria-expanded', String(expanded));
    });
    expand.setAttribute('aria-expanded', 'false');
    expand.hidden = true;
    tools.append(expand);
    const panels = card.querySelectorAll('.diff-group-side-content, .diff-group-inline');
    const overflows = () => [...panels].some((p) => p.scrollHeight > p.clientHeight + 1);
    this.updateExpand = () => {
      expand.hidden = !card.classList.contains('is-expanded') && !overflows();
    };
    this.resizeObserver = new ResizeObserver(() => this.updateExpand());
    panels.forEach((panel) => this.resizeObserver.observe(panel));

    const choose = (choice) => resolveGroup(this.view, this.id, choice);
    const actions = el('div', 'diff-group-actions');
    actions.append(
      actionButton('Keep mine', CHOICE.mine, choose),
      actionButton('Take source', CHOICE.source, choose),
    );
    if (sourceEntries.length && localEntries.length) {
      actions.append(actionButton('Keep both', CHOICE.both, choose));
    }
    card.append(actions);
    return card;
  }

  renderSummary(summary) {
    this.updateExpand?.();
    const group = summary?.groups?.find(({ id }) => id === this.id);
    if (!group) return;
    this.titleEl.textContent = groupTitle(group);
    const reason = reasonText(group.reason);
    const missing = !this.hasBase && group.reason === 'both-changed' ? ` ${NO_ORIGINAL}` : '';
    this.reasonEl.textContent = `${reason}${missing}`.trim();
    if (this.baseSummaryEl && group.preview?.base) {
      this.baseSummaryEl.textContent = `Was: ${group.preview.base}`;
    }
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
  const pick = (type) => (node, view, getPos) => (node.attrs.diffGroup
    ? new GroupCardView(node, view, getPos)
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

function buildBar(view, state) {
  const bar = el('div', 'diff-review-bar');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Review conflicts');
  state.countEl = el('p', 'diff-review-count');
  const step = (delta) => {
    const ids = state.summary?.groups.map(({ id }) => id) ?? [];
    if (!ids.length) return;
    state.index = (state.index + delta + ids.length) % ids.length;
    focusGroup(view, ids[state.index]);
  };
  const button = (label, cls, onClick) => {
    const b = el('button', `diff-review-btn ${cls}`, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };
  bar.append(
    state.countEl,
    button('Previous', 'is-prev', () => step(-1)),
    button('Next', 'is-next', () => step(1)),
    button('Accept all source', 'is-all-source', () => resolveAll(view, CHOICE.source)),
    button('Accept all mine', 'is-all-mine', () => resolveAll(view, CHOICE.mine)),
  );
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
  state.countEl.textContent = count === 1 ? '1 conflict to review' : `${count} conflicts to review`;
  if (state.index >= count) state.index = count - 1;
  if (!state.el.isConnected) view.dom.parentNode?.insertBefore(state.el, view.dom);
}

export function removeReviewBar(view) {
  bars.get(view)?.el.remove();
  bars.delete(view);
}

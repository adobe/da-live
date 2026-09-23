/* eslint-disable import/no-unresolved -- importmap */
import { Plugin } from 'da-y-wrapper';
import { suggestionRange } from './suggestion-plugin.js';
import { canvasBus } from '../utils/canvas-bus.js';

const ICONS = {
  accept: '/img/icons/s2-icon-checkmark-20-n.svg',
  reject: '/img/icons/s2-icon-close-20-n.svg',
};

function iconButton(kind, label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nx-action-btn-icon nx-btn-sm';
  btn.dataset.action = kind;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.innerHTML = `<svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${ICONS[kind]}#icon"></use></svg>`;
  // mousedown would blur the editor and collapse the range before the click lands.
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', onClick);
  return btn;
}

function authorAt(state, range) {
  const node = state.doc.nodeAt(range.from);
  const mark = node?.marks?.find((m) => m.type.name.startsWith('suggestion_'));
  return mark?.attrs?.username || '';
}

function build(view) {
  const el = document.createElement('div');
  el.className = 'ew-suggestion-popover';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Suggested edit');

  const label = document.createElement('span');
  label.className = 'ew-suggestion-popover-author';

  // Same channel the panel uses, so both routes get recorded the same way.
  const run = (action) => () => {
    const range = suggestionRange(view.state);
    if (!range) return;
    canvasBus.suggestionResolveRequest.emit({ from: range.from, to: range.to, action });
    view.focus();
  };

  el.append(
    label,
    iconButton('accept', 'Accept suggestion', run('accept')),
    iconButton('reject', 'Reject suggestion', run('reject')),
  );
  return { el, label };
}

export default function suggestionPopover() {
  return new Plugin({
    view(editorView) {
      const container = editorView.dom.parentElement;
      const { el, label } = build(editorView);
      container?.append(el);

      const place = (view) => {
        const range = view.editable ? suggestionRange(view.state) : null;
        if (!range || !container) {
          el.classList.remove('open');
          return;
        }
        const who = authorAt(view.state, range);
        label.textContent = who ? `${who} suggested` : 'Suggested edit';
        const coords = view.coordsAtPos(range.from);
        const box = container.getBoundingClientRect();
        el.style.left = `${coords.left - box.left}px`;
        el.style.top = `${coords.bottom - box.top + 6}px`;
        el.classList.add('open');
      };

      const onScroll = () => place(editorView);
      const scrollEl = container?.closest('.ew-editor-doc');
      scrollEl?.addEventListener('scroll', onScroll, { passive: true });
      place(editorView);

      return {
        update(view) { place(view); },
        destroy() {
          scrollEl?.removeEventListener('scroll', onScroll);
          el.remove();
        },
      };
    },
  });
}

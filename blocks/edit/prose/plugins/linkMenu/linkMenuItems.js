import { TextSelection } from 'da-y-wrapper';

function findExistingLink(state) {
  const { $from } = state.selection;
  const { node, offset } = $from.parent.childAfter($from.parentOffset);
  return {
    link: node,
    offset,
  };
}

export function findLinkAtCursor(state) {
  const linkMarkType = state.schema.marks.link;
  const { link } = findExistingLink(state);
  
  if (!link) return null;
  
  return link.marks.find((mark) => mark.type === linkMarkType);
}

function calculateLinkPosition(state, link, offset) {
  const { $from } = state.selection;
  const start = $from.pos - ($from.parentOffset - offset);
  return {
    start,
    end: start + link.nodeSize,
  };
}

function openLink(state) {
  const linkMark = findLinkAtCursor(state);
  if (linkMark?.attrs?.href) {
    window.open(linkMark.attrs.href, '_blank');
  }
  return true;
}

async function editLink(state, dispatch, view) {
  // Open existing edit link window
  const linkMarkType = state.schema.marks.link;
  const { linkItem } = await import('../menu/linkItem.js');
  const linkMenuItem = linkItem(linkMarkType);
  return linkMenuItem.spec.run(state, dispatch, view);
}

function copyLink(state) {
  const linkMark = findLinkAtCursor(state);
  if (linkMark?.attrs?.href) {
    navigator.clipboard.writeText(linkMark.attrs.href);
  }
  return true;
}

function removeLink(state, dispatch) {
  const linkMarkType = state.schema.marks.link;
  const { link, offset } = findExistingLink(state);
  
  if (!link) return false;
  
  const { start, end } = calculateLinkPosition(state, link, offset);
  const tr = state.tr
    .setSelection(TextSelection.create(state.doc, start, end))
    .removeMark(start, end, linkMarkType);
  
  dispatch(tr);
  return true;
}

/* eslint-disable import/prefer-default-export */
export function getLinkMenuItems() {
  return [
    {
      title: 'Open link',
      command: openLink,
      class: 'menu-item-open-link',
    },
    {
      title: 'Edit link',
      command: editLink,
      class: 'menu-item-edit-link',
    },
    {
      title: 'Copy link',
      command: copyLink,
      class: 'menu-item-copy-link',
    },
    {
      title: 'Remove link',
      command: removeLink,
      class: 'menu-item-remove-link',
    },
  ];
}

function findLinkAtCursor(state) {
  const { $from, $to } = state.selection;
  let linkMark = null;

  state.doc.nodesBetween($from.pos, $to.pos, (node) => {
    if (!linkMark) {
      const link = node.marks.find((mark) => mark.type.name === 'link');
      if (link) linkMark = link;
    }
  });

  return linkMark;
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
  ];
}

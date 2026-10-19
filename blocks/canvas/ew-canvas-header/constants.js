export const ICONS = {
  undo: '/img/icons/s2-icon-undo-20-n.svg',
  redo: '/img/icons/s2-icon-redo-20-n.svg',
  splitLeft: '/img/icons/s2-icon-splitleft-20-n.svg',
  splitRight: '/img/icons/s2-icon-splitright-20-n.svg',
  gridCompare: '/img/icons/s2-icon-gridcompare-20-n.svg',
  lock: '/img/icons/s2-icon-lock-20-n.svg',
  comment: '/img/icons/s2-icon-chat-20-n.svg',
};

export const EDITOR_VIEWS = /** @type {const} */ (['layout', 'content', 'split']);
export const EDITOR_VIEW_ITEMS = [
  { value: 'layout', label: 'Layout' },
  { value: 'content', label: 'Content' },
  { value: 'split', icon: ICONS.gridCompare, iconOnly: true, label: 'Split view' },
];

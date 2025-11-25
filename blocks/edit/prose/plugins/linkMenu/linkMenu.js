import { Plugin, PluginKey } from 'da-y-wrapper';
import { getLinkMenuItems } from './linkMenuItems.js';
import './link-menu.js';

const linkMenuKey = new PluginKey('linkMenu');

// Check if the cursor is on a link
function isOnLink(state) {
  const { $from, empty } = state.selection;

  if (!empty) return false;

  // Check if cursor is within a link mark
  const { node } = $from.parent.childAfter($from.parentOffset);
  if (!node) return false;

  return node.marks.some((mark) => mark.type.name === 'link');
}

// Get the link mark at cursor position
function getLinkOffset(state) {
  const { $from } = state.selection;
  const { offset } = $from.parent.childAfter($from.parentOffset);

  const absolutePos = $from.start() + offset;
  return absolutePos;
}

// Get the text content of the link
function getLinkText(state) {
  const { $from } = state.selection;
  const { node } = $from.parent.childAfter($from.parentOffset);

  return node?.textContent || '';
}

class LinkMenuView {
  constructor(view) {
    this.view = view;
    this.menu = document.createElement('link-menu');
    this.menu.items = getLinkMenuItems();
    this.lastLinkOffset = null;

    this.menu.addEventListener('item-selected', (e) => {
      this.selectItem(e.detail);
    });
  }

  showMenu() {
    const { state } = this.view;
    const { $anchor } = state.selection;

    const coords = this.view.coordsAtPos($anchor.pos);
    const linkText = getLinkText(state);

    const viewportCoords = {
      left: coords.left + window.pageXOffset,
      bottom: coords.bottom + window.pageYOffset,
    };

    this.menu.show(viewportCoords, linkText);
  }

  update(view) {
    if (!view) return;

    this.view = view;

    const { state, input } = view;

    if (isOnLink(state) && input?.lastSelectionOrigin === 'pointer') {
      const currentOffset = getLinkOffset(state);

      if (!this.menu.visible || currentOffset !== this.lastLinkOffset) {
        this.lastLinkOffset = currentOffset;
        this.showMenu();
      }
    } else if (this.menu.visible) {
      this.hide();
    }
  }

  selectItem(detail) {
    const { item } = detail;
    const { state, dispatch } = this.view;

    item.command(state, dispatch, this.view);

    this.hide();
  }

  handleKeyDown(event) {
    return this.menu.handleKeyDown(event);
  }

  hide() {
    this.lastLinkOffset = null;
    this.menu.hide();
  }

  destroy() {
    this.menu.remove();
  }
}

export default function linkMenu() {
  let pluginView = null;

  return new Plugin({
    key: linkMenuKey,
    props: {
      handleKeyDown(editorView, event) {
        if (pluginView?.menu.visible) {
          if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            pluginView.menu.handleKeyDown(event);
            return true;
          }
        }
        return false;
      },
    },
    view(editorView) {
      pluginView = new LinkMenuView(editorView);

      editorView.dom.parentNode.appendChild(pluginView.menu);
      return pluginView;
    },
  });
}

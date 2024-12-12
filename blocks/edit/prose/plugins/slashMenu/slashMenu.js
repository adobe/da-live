/* eslint-disable max-len */
import { Plugin, PluginKey } from 'da-y-wrapper';
import menuItems from './slashMenuItems.js';
import './slash-menu.js';

const slashMenuKey = new PluginKey('slashMenu');

class SlashMenuView {
  constructor(view) {
    this.view = view;
    this.menu = document.createElement('slash-menu');
    this.menu.items = menuItems || [];

    this.menu.addEventListener('item-selected', (e) => {
      this.selectItem(e.detail);
    });
  }

  update(view) {
    if (!view) return;

    this.view = view;

    const { state } = view;
    const { $cursor } = state.selection;

    if (!$cursor) {
      this.menu.hide();
      return;
    }

    // Check if we're at the start of an empty line or if there's only a slash command
    const textBefore = $cursor.parent.textContent.slice(0, $cursor.parentOffset);
    const match = textBefore.match(/^\/([^/]*(?:\s[^/]*)?)$/);

    const showSlashMenu = slashMenuKey?.getState(state)?.showSlashMenu;

    if (match) {
      if (!this.menu.visible || showSlashMenu) {
        const coords = this.view.coordsAtPos($cursor.pos);

        const viewportCoords = {
          left: coords.left + window.pageXOffset,
          bottom: coords.bottom + window.pageYOffset,
        };

        this.menu.show(viewportCoords);
      }

      const [command] = match[1].trim().split(/\s+/);
      this.menu.inputText = command;
    } else {
      this.menu.hide();
    }
  }

  selectItem(detail) {
    const { item } = detail;
    const { state, dispatch } = this.view;
    const { $cursor } = state.selection;
    if (!$cursor) return;

    const textBefore = $cursor.parent.textContent.slice(0, $cursor.parentOffset);
    const match = textBefore.match(/\/([^/]*(?:\s[^/]*)?)$/);

    if (match) {
      // Delete the slash command and any arguments
      const deleteFrom = $cursor.pos - match[0].length;
      const deleteTo = $cursor.pos;
      const tr = state.tr.delete(deleteFrom, deleteTo);

      const newState = state.apply(tr);

      // Split the match to get command and argument
      const [, ...args] = match[1].trim().split(/\s+/);
      const argument = args.length > 0 ? args.join(' ') : undefined;

      dispatch(tr);
      item.command(newState, dispatch, argument);
    } else {
      item.command(state, dispatch);
    }

    this.menu.hide();
  }

  handleKeyDown(event) {
    return this.menu.handleKeyDown(event);
  }

  destroy() {
    this.menu.remove();
  }
}

export default function slashMenu() {
  let pluginView = null;

  return new Plugin({
    key: slashMenuKey,
    state: {
      init() {
        return { showSlashMenu: false };
      },
      apply(tr, value) {
        const meta = tr.getMeta(slashMenuKey);
        if (meta !== undefined) {
          return { showSlashMenu: meta };
        }
        return value;
      },
    },
    props: {
      handleKeyDown(editorView, event) {
        const { state } = editorView;

        if (event.key === '/') {
          const { $cursor } = state.selection;

          // Only show menu if we're at the start of an empty line
          if ($cursor && $cursor.parentOffset === 0 && $cursor.parent.textContent === '') {
            const tr = state.tr.setMeta(slashMenuKey, true);
            editorView.dispatch(tr);
            return false;
          }
          return false;
        }

        if (pluginView?.menu.visible) {
          if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();

            if (event.key === 'Enter') {
              const filteredItems = pluginView.menu.getFilteredItems();
              const selectedItem = filteredItems[pluginView.menu.selectedIndex];
              if (selectedItem) {
                pluginView.selectItem({ item: selectedItem });
              }
            } else {
              pluginView.menu.handleKeyDown(event);
            }
            return true;
          }
        }
        return false;
      },
    },
    view(editorView) {
      pluginView = new SlashMenuView(editorView);

      editorView.dom.parentNode.appendChild(pluginView.menu);
      return pluginView;
    },
  });
}

/* eslint-disable max-len */
import { Plugin, PluginKey } from 'da-y-wrapper';
import menuItems from './slashMenuItems.js';
import './slash-menu.js';

const SLASH_COMMAND_REGEX = /^\/(([^/\s]+(?:\s+[^/\s]+)*)\s*([^/\s]*))?$/;
const slashMenuKey = new PluginKey('slashMenu');

function extractArgument(title, command) {
  const parts = command.toLowerCase().split(/\s+/);
  return parts.length > 1 && title.toLowerCase().startsWith(parts.slice(0, -1).join(' '))
    ? parts[parts.length - 1]
    : undefined;
}

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

    const textBefore = $cursor.parent.textContent.slice(0, $cursor.parentOffset);
    if (!textBefore?.startsWith('/')) {
      if (this.menu.visible) this.menu.hide();
      return;
    }

    const match = textBefore.match(SLASH_COMMAND_REGEX);
    if (match) {
      const showSlashMenu = slashMenuKey?.getState(state)?.showSlashMenu;
      if (!this.menu.visible || showSlashMenu) {
        const coords = this.view.coordsAtPos($cursor.pos);

        const viewportCoords = {
          left: coords.left + window.pageXOffset,
          bottom: coords.bottom + window.pageYOffset,
        };

        this.menu.show(viewportCoords);
      }

      this.menu.command = match[1] || '';
    } else if (this.menu.visible) {
      this.menu.command = '';
      this.menu.hide();
    }
  }

  selectItem(detail) {
    const { item } = detail;
    const { state, dispatch } = this.view;
    const { $cursor } = state.selection;
    if (!$cursor) return;

    // Delete the slash command and any arguments
    const deleteFrom = $cursor.pos - (this.menu.command.length + 1);
    const deleteTo = $cursor.pos;
    const tr = state.tr.delete(deleteFrom, deleteTo);
    const newState = state.apply(tr);

    const argument = extractArgument(item.title, this.menu.command);

    dispatch(tr);
    item.command(newState, dispatch, argument);

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

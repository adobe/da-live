/* eslint-disable max-len */
import { Plugin, PluginKey } from 'da-y-wrapper';
import { getKeyAutocomplete } from './keyAutocomplete.js';
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

    this.menu.addEventListener('reset-slashmenu', () => {
      // reset menu to default items
      this.menu.items = menuItems;
      this.menu.left = 0;
      this.menu.top = 0;
    });
  }

  update(view) {
    if (!view) return;

    this.view = view;

    const { state } = view;
    const { $cursor } = state.selection;

    if (!$cursor) {
      this.hide();
      return;
    }

    const textBefore = $cursor.parent.textContent.slice(0, $cursor.parentOffset);
    if (!textBefore?.startsWith('/')) {
      if (this.menu.visible) this.hide();
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
      this.hide();
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

    this.hide();
  }

  handleKeyDown(event) {
    return this.menu.handleKeyDown(event);
  }

  hide() {
    this.menu.hide();
  }

  destroy() {
    this.menu.remove();
  }
}

// Get the table name if the cursor is in a table cell
const getTableName = ($cursor) => {
  const { depth } = $cursor;
  let tableCellDepth = -1;

  // Search up the tree for a table cell
  for (let d = depth; d > 0; d -= 1) {
    const node = $cursor.node(d);
    if (node.type.name === 'table_cell') {
      tableCellDepth = d;
      break;
    }
  }

  if (tableCellDepth === -1) return false; // not in a table cell

  // Get the row node and cell index
  const rowDepth = tableCellDepth - 1;
  const tableDepth = rowDepth - 1;
  const table = $cursor.node(tableDepth);
  const firstRow = table.child(0);
  const cellIndex = $cursor.index(tableCellDepth - 1);
  const row = $cursor.node(rowDepth);

  // Only proceed if we're in the second column
  if (!(row.childCount > 1 && cellIndex === 1)) return false;

  const firstRowContent = firstRow.child(0).textContent;
  const tableNameMatch = firstRowContent.match(/^([a-zA-Z0-9_-]+)(?:\s*\([^)]*\))?$/);

  const currentRowFirstColContent = row.child(0).textContent;

  if (tableNameMatch) {
    return {
      tableName: tableNameMatch[1],
      keyValue: currentRowFirstColContent,
    };
  }

  return false;
};

export default function slashMenu() {
  let pluginView = null;

  // Start fetching data immediately
  getKeyAutocomplete().then((data) => {
    if (pluginView?.view) {
      const tr = pluginView.view.state.tr.setMeta(slashMenuKey, { autocompleteData: data });
      pluginView.view.dispatch(tr);
    }
  });

  return new Plugin({
    key: slashMenuKey,
    state: {
      init() {
        return {
          showSlashMenu: false,
          autocompleteData: null,
        };
      },
      apply(tr, value) {
        const meta = tr.getMeta(slashMenuKey);
        if (meta !== undefined) {
          return { ...value, ...meta };
        }
        return value;
      },
    },
    props: {
      handleKeyDown(editorView, event) {
        const { state } = editorView;
        const pluginState = slashMenuKey.getState(state);

        if (event.key === '/') {
          const { $cursor } = state.selection;

          // Check if we're at start of empty line
          if ($cursor?.parentOffset === 0 && $cursor?.parent?.textContent === '') {
            const { tableName, keyValue } = getTableName($cursor);
            if (tableName) {
              const keyData = pluginState.autocompleteData?.get(tableName);
              if (keyData) {
                const values = keyData.get(keyValue);
                if (values) {
                  pluginView.menu.items = values;
                }
              }
            }

            const tr = state.tr.setMeta(slashMenuKey, { showSlashMenu: true });
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

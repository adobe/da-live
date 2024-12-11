/* eslint-disable max-len */
import { Plugin, PluginKey, setBlockType, wrapInList, wrapIn } from 'da-y-wrapper';
import insertTable from '../table.js';
import './slash-menu.js';
import { insertSectionBreak } from './menu.js';
import openLibrary from '../../da-library/da-library.js';

const slashMenuKey = new PluginKey('slashMenu');

const setHeading = (state, dispatch, level) => {
  const type = state.schema.nodes.heading;
  return setBlockType(type, { level })(state, dispatch);
};

const wrapInBlockquote = (state, dispatch) => {
  const { blockquote } = state.schema.nodes;
  return wrapIn(blockquote)(state, dispatch);
};

const wrapInCodeBlock = (state, dispatch) => {
  // eslint-disable-next-line camelcase
  const { code_block } = state.schema.nodes;
  return setBlockType(code_block)(state, dispatch);
};

class SlashMenuView {
  constructor(view) {
    this.view = view;
    this.menu = document.createElement('slash-menu');
    this.menu.items = [];

    this.menu.addEventListener('item-selected', (e) => {
      this.selectItem(e.detail.item);
    });
  }

  update(view) {
    if (!view) return;

    this.view = view;

    // Initialize menu items if they haven't been set yet
    if (this.menu.items.length === 0) {
      this.menu.items = [
        {
          title: 'Heading 1',
          command: (state, dispatch) => setHeading(state, dispatch, 1),
          class: 'menu-item-h1',
        },
        {
          title: 'Heading 2',
          command: (state, dispatch) => setHeading(state, dispatch, 2),
          class: 'menu-item-h2',
        },
        {
          title: 'Heading 3',
          command: (state, dispatch) => setHeading(state, dispatch, 3),
          class: 'menu-item-h3',
        },
        {
          title: 'Blockquote',
          command: wrapInBlockquote,
          class: 'menu-item-blockquote',
        },
        {
          title: 'Code Block',
          command: wrapInCodeBlock,
          class: 'menu-item-codeblock',
        },
        {
          title: 'Bullet List',
          command: (state, dispatch) => wrapInList(state.schema.nodes.bullet_list)(state, dispatch),
          class: 'bullet-list',
        },
        {
          title: 'Numbered List',
          command: (state, dispatch) => wrapInList(state.schema.nodes.ordered_list)(state, dispatch),
          class: 'ordered-list',
        },
        {
          title: 'Table',
          command: insertTable,
          class: 'insert-table',
        },
        {
          title: 'Section Break',
          command: insertSectionBreak,
          class: 'edit-hr',
        },
        {
          title: 'Library',
          command: openLibrary,
          class: 'open-library',
        },
      ];
    }

    const { state } = view;
    const { selection } = state;
    const { $cursor } = selection;

    if (!$cursor) {
      this.menu.hide();
      return;
    }

    // Check for slash command in current text
    const textBefore = $cursor.parent.textContent.slice(0, $cursor.parentOffset);
    const match = textBefore.match(/\/([^/]*)$/);

    // Get the slash key state from the plugin
    const pluginState = slashMenuKey.getState(state);
    const showSlashMenu = pluginState?.showSlashMenu;

    if (match) {
      // Show menu if it's not visible, or update filter if it is
      if (!this.menu.visible || showSlashMenu) {
        const coords = this.view.coordsAtPos($cursor.pos);

        // Convert coordinates to be relative to the viewport
        const viewportCoords = {
          left: coords.left + window.pageXOffset,
          bottom: coords.bottom + window.pageYOffset,
        };

        this.menu.show(viewportCoords);
      }

      // Always update the filter text
      this.menu.inputText = match[1] || '';
    } else {
      this.menu.hide();
    }
  }

  selectItem(item) {
    const { state, dispatch } = this.view;
    const { $cursor } = state.selection;
    if (!$cursor) return;

    const textBefore = $cursor.parent.textContent.slice(0, $cursor.parentOffset);
    const match = textBefore.match(/\/[^/]*$/);
    if (match) {
      // Delete the slash command first
      const deleteFrom = $cursor.pos - match[0].length;
      const deleteTo = $cursor.pos;
      const tr = state.tr.delete(deleteFrom, deleteTo);

      // Create a new state after deletion
      const newState = state.apply(tr);

      if (item.title.startsWith('Heading')) {
        const level = parseInt(item.title.split(' ')[1], 10);
        tr.setBlockType(deleteFrom, deleteFrom, state.schema.nodes.heading, { level });
        dispatch(tr);
      } else if (item.title === 'Bullet List') {
        dispatch(tr);
        wrapInList(newState.schema.nodes.bullet_list)(newState, dispatch);
      } else if (item.title === 'Numbered List') {
        dispatch(tr);
        wrapInList(newState.schema.nodes.ordered_list)(newState, dispatch);
      } else {
        dispatch(tr);
        item.command(newState, dispatch);
      }
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
          // Show the menu but don't prevent the default action
          const tr = state.tr.setMeta(slashMenuKey, true);
          editorView.dispatch(tr);
          return false;
        }

        if (pluginView?.menu.visible) {
          // Handle navigation keys
          if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            pluginView.menu.handleKeyDown(event);
            return true;
          }

          // Update filter text for other keypresses
          const { $cursor } = state.selection;
          if ($cursor) {
            const textBefore = $cursor.parent.textContent.slice(0, $cursor.parentOffset);
            const match = textBefore.match(/\/([^/]*)$/);
            if (match) {
              // Let the keypress go through but update the filter
              setTimeout(() => {
                const updatedText = $cursor.parent.textContent.slice(0, $cursor.parentOffset);
                const updatedMatch = updatedText.match(/\/([^/]*)$/);
                if (updatedMatch) {
                  pluginView.menu.inputText = updatedMatch[1] || '';
                } else {
                  pluginView.menu.hide();
                }
              }, 0);
              return false;
            }
          }

          // Hide menu if we can't find the slash command anymore
          const tr = state.tr.setMeta(slashMenuKey, false);
          editorView.dispatch(tr);
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

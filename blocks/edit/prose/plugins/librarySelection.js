import { Plugin, Decoration, DecorationSet, NodeSelection } from 'da-y-wrapper';

export default function librarySelection() {
  let isLibraryOpen = false;

  return new Plugin({
    state: {
      init() {
        // Check initial state
        const root = window.view?.dom?.getRootNode() || document;
        isLibraryOpen = !!root.querySelector('da-library');
        return isLibraryOpen;
      },
      apply(tr, value) {
        // Update state if meta property is set (we will dispatch tr from event listeners)
        const meta = tr.getMeta('libraryOpen');
        if (meta !== undefined) return meta;
        return value;
      },
    },
    view(editorView) {
      const handleOpen = () => {
        isLibraryOpen = true;
        editorView.dispatch(editorView.state.tr.setMeta('libraryOpen', true));
      };
      const handleClose = () => {
        isLibraryOpen = false;
        editorView.dispatch(editorView.state.tr.setMeta('libraryOpen', false));
      };

      window.addEventListener('da-library-open', handleOpen);
      window.addEventListener('da-library-close', handleClose);

      return {
        destroy() {
          window.removeEventListener('da-library-open', handleOpen);
          window.removeEventListener('da-library-close', handleClose);
        },
      };
    },
    props: {
      decorations(state) {
        if (!window.view) return null;

        // If editor has focus, no need for fake selection
        if (window.view.hasFocus()) return null;

        // Use plugin state
        const isOpen = this.getState(state);
        if (!isOpen) return null;

        const { selection } = state;
        if (selection.empty) {
          const caret = document.createElement('span');
          caret.className = 'da-fake-caret';
          return DecorationSet.create(state.doc, [
            Decoration.widget(selection.head, caret, { key: 'da-fake-caret' }),
          ]);
        }

        if (selection instanceof NodeSelection) {
          return DecorationSet.create(state.doc, [
            Decoration.node(selection.from, selection.to, { class: 'da-fake-selection' }),
          ]);
        }

        return DecorationSet.create(state.doc, [
          Decoration.inline(selection.from, selection.to, { class: 'da-fake-selection' }),
        ]);
      },
    },
  });
}

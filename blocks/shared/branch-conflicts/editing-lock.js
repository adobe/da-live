// Keep the branch editor inert, not the page: the selector and conflict UI must
// remain usable. The server's SYNC_IN_PROGRESS guard is the authoritative fence.
const EDITORS = [
  'ew-editor-doc', 'ew-editor-wysiwyg', 'ew-selection-toolbar',
  'da-content', '.da-sheet', 'nx-form', 'da-actionbar', 'da-new',
].join(', ');
let observer;
let locked = false;
const originals = new Map();

// The navigation barrier temporarily makes this editor inert before the server
// can return a session. Remember its real state before that temporary freeze.
export function rememberEditorBeforeBarrier() {
  const editor = document.querySelector('ew-editor-doc') || document.querySelector('da-content')
    || document.querySelector('.da-sheet') || document.querySelector('nx-form');
  if (editor && !originals.has(editor)) originals.set(editor, editor.inert);
}

export function forgetUnneededEditorSnapshot() {
  if (!locked) originals.clear();
}

function apply() {
  const visit = (root) => {
    root.querySelectorAll(EDITORS).forEach((editor) => {
      if (!originals.has(editor)) originals.set(editor, editor.inert);
      if (editor.localName === 'ew-editor-doc' && editor.blockEditMode) editor.exitBlockEdit();
      editor.inert = true;
    });
    root.querySelectorAll('*').forEach((element) => {
      if (element.shadowRoot) {
        observer?.observe(element.shadowRoot, { childList: true, subtree: true });
        visit(element.shadowRoot);
      }
    });
  };
  visit(document);
}

export function lockBranchEditing() {
  locked = true;
  if (!observer && document.body) {
    observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  apply();
}

export function unlockBranchEditing() {
  locked = false;
  observer?.disconnect();
  observer = undefined;
  originals.forEach((value, editor) => { editor.inert = value; });
  originals.clear();
}

export function branchEditingLocked() {
  return locked;
}

// Dependency-free so da-nx's quick-edit iframe can import it without pulling in prose2aem's deps.
const iconRegex = /(?<!(?:https?|urn)[^\s<>]*):(#?[a-z_-]+[a-z\d]*):/gi; // matches icon pattern but not in URLs
const EDITOR_ARTIFACTS = [
  'img.ProseMirror-separator',
  '.ProseMirror-trailingBreak',
  '.ProseMirror-yjs-cursor',
  '.ProseMirror-gapcursor',
].join(', ');

export function removeEditorArtifacts(editor) {
  editor.querySelectorAll(EDITOR_ARTIFACTS).forEach((el) => el.remove());
}

export function parseIcons(editor) {
  const html = editor.innerHTML.replace(
    iconRegex,
    (_, iconName) => `<span class="icon icon-${iconName}"></span>`,
  );
  if (html !== editor.innerHTML) editor.innerHTML = html;
}

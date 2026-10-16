import { expect } from '@esm-bundle/chai';
import { parseIcons, removeEditorArtifacts } from '../../../../blocks/shared/prose-cleanup.js';

const el = (html) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
};

describe('prose-cleanup', () => {
  it('removes ProseMirror editor artifacts', () => {
    const editor = el('<p>a<img class="ProseMirror-separator"><br class="ProseMirror-trailingBreak">'
      + '<span class="ProseMirror-yjs-cursor">x</span><span class="ProseMirror-gapcursor"></span></p>');
    removeEditorArtifacts(editor);
    expect(editor.innerHTML).to.equal('<p>a</p>');
  });

  it('converts icon syntax but not URLs, on repeated calls', () => {
    const first = el('<p>Go :arrow: <a href="https://x.com/:a:">x</a></p>');
    const second = el('<p>:home:</p>');
    parseIcons(first);
    parseIcons(second);
    expect(first.innerHTML).to.equal('<p>Go <span class="icon icon-arrow"></span> <a href="https://x.com/:a:">x</a></p>');
    expect(second.innerHTML).to.equal('<p><span class="icon icon-home"></span></p>');
  });

  it('leaves the DOM untouched without icons', () => {
    const editor = el('<p>plain</p>');
    const p = editor.firstChild;
    parseIcons(editor);
    expect(editor.firstChild).to.equal(p);
  });
});

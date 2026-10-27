import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let initProse;

before(async () => {
  ({ default: initProse } = await import('../../../../../blocks/canvas/ew-editor-doc/prose.js'));
});

function paste(view, text) {
  const clipboardData = new DataTransfer();
  clipboardData.setData('text/plain', text);
  view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
}

function linkHrefs(view) {
  const hrefs = [];
  view.state.doc.descendants((node) => {
    const mark = view.state.schema.marks.link.isInSet(node.marks);
    if (mark) hrefs.push({ text: node.text, href: mark.attrs.href });
  });
  return hrefs;
}

describe('canvas doc link paste', () => {
  let result;
  let view;

  beforeEach(async () => {
    result = await initProse({
      path: 'https://admin.da.live/source/pasteorg/pastesite/page.html',
      permissions: ['read', 'write'],
      setEditable: () => {},
      getToken: () => 'test-token',
    });
    ({ view } = result);
    document.body.append(view.dom);
    view.dispatch(view.state.tr.insertText('hello world', 1));
  });

  afterEach(() => {
    const { wsProvider, ydoc } = result;
    wsProvider.disconnect({ data: 'Client navigation' });
    wsProvider.destroy?.();
    view.dom.remove();
    view.destroy();
    ydoc.destroy();
  });

  it('links the selected text to a pasted URL', () => {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));
    paste(view, 'https://example.com/page');

    expect(view.state.doc.textContent).to.equal('hello world');
    expect(linkHrefs(view)).to.deep.equal([{ text: 'hello', href: 'https://example.com/page' }]);
  });

  it('replaces the selection when the pasted text is not a URL', () => {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));
    paste(view, 'goodbye');

    expect(view.state.doc.textContent).to.equal('goodbye world');
    expect(linkHrefs(view)).to.be.empty;
  });
});

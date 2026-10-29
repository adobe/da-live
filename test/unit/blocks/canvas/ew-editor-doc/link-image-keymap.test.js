import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { NodeSelection, TextSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let initProse;
let toolbarController;

before(async () => {
  ({ default: initProse } = await import('../../../../../blocks/canvas/ew-editor-doc/prose.js'));
  ({ toolbarController } = await import('../../../../../blocks/canvas/editor-utils/toolbar-controller.js'));
});

const isMac = /Mac/.test(navigator.platform);

function pressModK(view) {
  view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: !isMac, metaKey: isMac, bubbles: true, cancelable: true }));
}

describe('canvas Mod-k with link-images', () => {
  let result;
  let view;
  let openLinkDialog;

  beforeEach(async () => {
    result = await initProse({
      path: 'https://admin.da.live/source/linkorg/linksite/page.html',
      permissions: ['read', 'write'],
      setEditable: () => {},
      getToken: () => 'test-token',
    });
    ({ view } = result);
    document.body.append(view.dom);
    openLinkDialog = sinon.spy();
    sinon.stub(toolbarController, 'ensureToolbar').returns({ openLinkDialog });
    view.dispatch(view.state.tr.insertText('hello ', 1));
  });

  afterEach(() => {
    sinon.restore();
    const { wsProvider, ydoc } = result;
    wsProvider.disconnect({ data: 'Client navigation' });
    wsProvider.destroy?.();
    view.dom.remove();
    view.destroy();
    ydoc.destroy();
  });

  function insertImageAndSelect(attrs) {
    const { schema } = view.state;
    const image = schema.nodes.image.create({ src: 'https://cdn.example.com/a.jpg', ...attrs });
    view.dispatch(view.state.tr.insert(7, image));
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 7)));
  }

  it('does not open the link dialog when a link-image is selected', () => {
    insertImageAndSelect({ editAs: 'image', alt: 'Hero' });
    pressModK(view);
    expect(openLinkDialog.called).to.equal(false);
  });

  it('opens the link dialog when a regular image is selected', () => {
    insertImageAndSelect({ alt: 'Hero' });
    pressModK(view);
    expect(openLinkDialog.called).to.equal(true);
  });

  it('opens the link dialog for a text selection', () => {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));
    pressModK(view);
    expect(openLinkDialog.called).to.equal(true);
  });
});

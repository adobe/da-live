import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { handleCommentMarkerClick, handleCommentMarkerClear } = await import('../../../../../blocks/canvas/ew-editor-wysiwyg/quick-edit-controller.js');
const { setCommentsController } = await import('../../../../../blocks/canvas/editor-utils/comments-bridge.js');

describe('handleCommentMarkerClick', () => {
  afterEach(() => setCommentsController(null));

  it('selects the thread, scrolls to it, and opens the comments panel', async () => {
    let selected = null;
    let scrolled = null;
    setCommentsController({
      setSelectedThread(id) { selected = id; },
      scrollToThread(id) { scrolled = id; },
    });
    if (!document.querySelector('ew-canvas-header')) {
      document.body.appendChild(document.createElement('ew-canvas-header'));
    }
    const evt = await new Promise((resolve) => {
      document.querySelector('ew-canvas-header')
        .addEventListener('nx-canvas-open-panel', resolve, { once: true });
      handleCommentMarkerClick({ threadId: 't9' });
    });
    expect(selected).to.equal('t9');
    expect(scrolled).to.equal('t9');
    expect(evt.detail).to.deep.equal({ position: 'after', panelName: 'comments' });
  });

  it('handleCommentMarkerClear deselects the active thread', () => {
    let selected = 't9';
    setCommentsController({ setSelectedThread(id) { selected = id; } });
    handleCommentMarkerClear();
    expect(selected).to.equal(null);
  });
});

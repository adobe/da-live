import { expect } from '@esm-bundle/chai';
import { COMMAND_BY_ID } from '../../../../../blocks/canvas/editor-utils/command-defs.js';
import { setCommentsController } from '../../../../../blocks/canvas/editor-utils/comments-bridge.js';

describe('add-comment command', () => {
  afterEach(() => setCommentsController(null));

  it('exists in the toolbar-comment group', () => {
    const cmd = COMMAND_BY_ID.get('add-comment');
    expect(cmd).to.exist;
    expect(cmd.showIn).to.include('toolbar-comment');
  });

  it('apply() calls requestCompose and dispatches nx-canvas-open-panel', async () => {
    let composed = false;
    setCommentsController({ requestCompose() { composed = true; } });
    const evt = await new Promise((resolve) => {
      document.querySelector('ew-canvas-header')
        || document.body.appendChild(document.createElement('ew-canvas-header'));
      document.querySelector('ew-canvas-header')
        .addEventListener('nx-canvas-open-panel', resolve, { once: true });
      COMMAND_BY_ID.get('add-comment').apply({ focus() {} });
    });
    expect(composed).to.equal(true);
    expect(evt.detail).to.deep.equal({ position: 'after', panelName: 'comments' });
  });
});

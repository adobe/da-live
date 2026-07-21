import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { handleCommentShortcut } = await import('../../../../blocks/canvas/canvas.js');

describe('handleCommentShortcut', () => {
  const evt = (over = {}) => ({ metaKey: true, altKey: true, code: 'KeyM', preventDefault() {}, ...over });

  it('ignores non-matching keys', () => {
    let opened = false;
    handleCommentShortcut(evt({ code: 'KeyK' }), { controller: { requestCompose() {} }, openPanel: () => { opened = true; } });
    expect(opened).to.equal(false);
  });

  it('requests compose and opens the panel on match', () => {
    let composed = false; let opened = false;
    handleCommentShortcut(evt(), {
      controller: { requestCompose() { composed = true; } },
      openPanel: () => { opened = true; },
    });
    expect(composed).to.equal(true);
    expect(opened).to.equal(true);
  });
});

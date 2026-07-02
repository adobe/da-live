import { expect } from '@esm-bundle/chai';
import {
  getCommentsBridge,
  setCommentsController,
  formatCommentsViewLabel,
} from '../../../../../blocks/canvas/editor-utils/comments-bridge.js';

describe('comments-bridge', () => {
  afterEach(() => setCommentsController(null));

  it('stores the controller on the singleton', () => {
    const controller = { id: 'c1' };
    setCommentsController(controller);
    expect(getCommentsBridge().controller).to.equal(controller);
  });

  it('dispatches nx-comments-controller-change on document', async () => {
    const controller = { id: 'c2' };
    const event = await new Promise((resolve) => {
      document.addEventListener('nx-comments-controller-change', resolve, { once: true });
      setCommentsController(controller);
    });
    expect(event.detail.controller).to.equal(controller);
  });
});

describe('formatCommentsViewLabel', () => {
  it('includes the count when active threads exist', () => {
    expect(formatCommentsViewLabel(20)).to.equal('Comments (20)');
  });

  it('returns plain Comments when the count is zero', () => {
    expect(formatCommentsViewLabel(0)).to.equal('Comments');
    expect(formatCommentsViewLabel()).to.equal('Comments');
  });
});

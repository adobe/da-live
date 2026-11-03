import { expect } from '@esm-bundle/chai';
import { buildThreadGroups } from '../../../../../../blocks/canvas/comments/helpers/thread-grouping.js';

function storeWith(comments) {
  return {
    forEach(fn) {
      comments.forEach((comment) => fn(comment, comment.id));
    },
  };
}

describe('buildThreadGroups', () => {
  const imageThread = {
    id: 'image-thread',
    threadId: null,
    anchorType: 'image',
    body: 'Replace this image',
    createdAt: 1,
    resolved: false,
  };

  it('hides an image thread while its image anchor is detached', () => {
    const groups = buildThreadGroups({
      store: storeWith([imageThread]),
      attachedIds: new Set(),
    });

    expect(groups.active).to.deep.equal([]);
    expect(groups.detached).to.deep.equal([]);
    expect(groups.resolved).to.deep.equal([]);
  });

  it('returns the same image thread to active when its image anchor is restored', () => {
    const groups = buildThreadGroups({
      store: storeWith([imageThread]),
      attachedIds: new Set(['image-thread']),
    });

    expect(groups.active).to.have.lengthOf(1);
    expect(groups.active[0].id).to.equal('image-thread');
    expect(groups.detached).to.deep.equal([]);
  });

  it('hides a text thread while its text anchor is detached', () => {
    const textThread = {
      ...imageThread,
      id: 'text-thread',
      anchorType: 'text',
      anchorText: 'Deleted text',
    };
    const groups = buildThreadGroups({
      store: storeWith([textThread]),
      attachedIds: new Set(),
    });

    expect(groups.active).to.deep.equal([]);
    expect(groups.detached).to.deep.equal([]);
    expect(groups.resolved).to.deep.equal([]);
  });
});

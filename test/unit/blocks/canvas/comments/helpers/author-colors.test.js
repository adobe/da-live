import { expect } from '@esm-bundle/chai';
import { buildAuthorColorMap, authorColorSet } from '../../../../../../blocks/canvas/comments/helpers/author-colors.js';
import { slotColorSet } from '../../../../../../blocks/canvas/editor-utils/author-color.js';

const makeStore = (comments) => ({ forEach: (cb) => comments.forEach((c) => cb(c)) });

describe('author-colors', () => {
  it('assigns unique palette slots in first-comment order', () => {
    const store = makeStore([
      { author: { id: 'a' }, createdAt: 100 },
      { author: { id: 'b' }, createdAt: 200 },
      { author: { id: 'a' }, createdAt: 300 }, // a again — same slot
    ]);
    const a = authorColorSet(store, { id: 'a' });
    const b = authorColorSet(store, { id: 'b' });
    expect(a.bg).to.not.equal(b.bg);
    expect(a).to.deep.equal(slotColorSet(0)); // a commented first
    expect(b).to.deep.equal(slotColorSet(1));
  });

  it('orders by earliest comment regardless of store iteration order', () => {
    const store = makeStore([
      { author: { id: 'late' }, createdAt: 500 },
      { author: { id: 'early' }, createdAt: 100 },
    ]);
    expect(authorColorSet(store, { id: 'early' })).to.deep.equal(slotColorSet(0));
    expect(authorColorSet(store, { id: 'late' })).to.deep.equal(slotColorSet(1));
  });

  it('is stable: a new author never shifts existing authors', () => {
    const base = [{ author: { id: 'a' }, createdAt: 100 }, { author: { id: 'b' }, createdAt: 200 }];
    const before = makeStore(base);
    const after = makeStore([...base, { author: { id: 'c' }, createdAt: 300 }]);
    expect(authorColorSet(after, { id: 'a' }).bg).to.equal(authorColorSet(before, { id: 'a' }).bg);
    expect(authorColorSet(after, { id: 'b' }).bg).to.equal(authorColorSet(before, { id: 'b' }).bg);
  });

  it('previews the next slot for an author not yet in the store, matching post', () => {
    const before = makeStore([{ author: { id: 'a' }, createdAt: 100 }]); // 1 author
    // 'b' hasn't commented yet — compose preview should be slot 1...
    expect(authorColorSet(before, { id: 'b' })).to.deep.equal(slotColorSet(1));
    // ...and stay slot 1 once posted.
    const after = makeStore([{ author: { id: 'a' }, createdAt: 100 }, { author: { id: 'b' }, createdAt: 200 }]);
    expect(authorColorSet(after, { id: 'b' })).to.deep.equal(slotColorSet(1));
  });

  it('prebuilt map matches per-author resolution', () => {
    const store = makeStore([{ author: { email: 'x@y.com' }, createdAt: 1 }]);
    const map = buildAuthorColorMap(store);
    expect(authorColorSet(store, { email: 'x@y.com' }, map)).to.deep.equal(slotColorSet(0));
  });
});

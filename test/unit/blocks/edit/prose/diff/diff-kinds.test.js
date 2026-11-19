import { expect } from '@esm-bundle/chai';
import { getDiffKind, getKindLabel } from '../../../../../../blocks/edit/prose/diff/diff-kinds.js';

describe('diff kinds', () => {
  it('reads the kind from the node or its first child', () => {
    expect(getDiffKind({ attrs: { diffKind: 'incoming' } })).to.equal('incoming');
    expect(getDiffKind({ attrs: {}, firstChild: { attrs: { diffKind: 'conflict' } } })).to.equal('conflict');
  });

  it('ignores missing and unknown kinds', () => {
    expect(getDiffKind({ attrs: {} })).to.equal(null);
    expect(getDiffKind({ attrs: { diffKind: 'nope' } })).to.equal(null);
    expect(getDiffKind(null)).to.equal(null);
  });

  it('labels each kind by who changed it', () => {
    expect(getKindLabel('incoming')).to.equal('Upstream added');
    expect(getKindLabel('local-removed')).to.equal('Local removed');
    expect(getKindLabel('conflict')).to.equal('Both changed');
    expect(getKindLabel('local-changed')).to.equal('Local changed');
    expect(getKindLabel(null)).to.equal(null);
  });
});

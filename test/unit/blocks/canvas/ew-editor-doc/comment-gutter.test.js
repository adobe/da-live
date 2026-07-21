import { expect } from '@esm-bundle/chai';
import { groupMarkersByLine } from '../../../../../blocks/canvas/ew-editor-doc/utils/comment-gutter.js';

describe('groupMarkersByLine', () => {
  it('groups markers within tolerance and separates distant ones', () => {
    const markers = [
      { id: 'a', top: 100 },
      { id: 'c', top: 140 },
      { id: 'b', top: 103 },
      { id: 'd', top: 141 },
    ];
    const lines = groupMarkersByLine(markers, 12);
    expect(lines).to.have.length(2);
    expect(lines[0].map((m) => m.id)).to.deep.equal(['a', 'b']);
    expect(lines[1].map((m) => m.id)).to.deep.equal(['c', 'd']);
  });

  it('keeps each marker on its own line when spaced apart', () => {
    const lines = groupMarkersByLine([{ id: 'a', top: 0 }, { id: 'b', top: 50 }], 12);
    expect(lines.map((l) => l.length)).to.deep.equal([1, 1]);
  });
});

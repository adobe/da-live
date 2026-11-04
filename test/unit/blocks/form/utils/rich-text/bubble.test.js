import { expect } from '@esm-bundle/chai';
import { placeBubble } from '../../../../../../blocks/form/utils/rich-text/bubble.js';

describe('placeBubble', () => {
  const area = { left: 100, right: 500, top: 100, bottom: 300, width: 400 };
  const size = { width: 120, height: 30 };
  const line = (top, left) => ({ top, bottom: top + 20, left });

  it('centers above a single-line selection', () => {
    const place = placeBubble({ start: line(200, 200), end: line(200, 300), area, ...size });
    expect(place).to.deep.equal({ left: 90, top: 60, hidden: false });
  });

  it('centers a multi-line selection on its first line', () => {
    const { left } = placeBubble({ start: line(200, 300), end: line(220, 150), area, ...size });
    expect(left).to.equal(240);
  });

  it('keeps the bubble inside the area', () => {
    const start = placeBubble({ start: line(200, 100), end: line(200, 110), area, ...size });
    const end = placeBubble({ start: line(200, 490), end: line(200, 500), area, ...size });
    expect(start.left).to.equal(8);
    expect(end.left).to.equal(272);
  });

  it('flips below the selection when there is no room above', () => {
    const { top } = placeBubble({ start: line(110, 200), end: line(130, 300), area, ...size });
    expect(top).to.equal(60);
  });

  it('hides when the selection starts outside the area', () => {
    const { hidden } = placeBubble({ start: line(320, 200), end: line(320, 300), area, ...size });
    expect(hidden).to.be.true;
  });
});

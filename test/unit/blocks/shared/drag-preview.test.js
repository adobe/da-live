import { expect } from '@esm-bundle/chai';
import drawDragPreview from '../../../../blocks/shared/drag-preview.js';

function createElement(style, text = '') {
  const element = document.createElement('div');
  element.style.cssText = style;
  element.textContent = text;
  document.body.append(element);
  return element;
}

const alphaAt = (preview, x, y) => preview.getContext('2d').getImageData(x, y, 1, 1).data[3];

describe('drawDragPreview', () => {
  let elements;

  beforeEach(() => {
    elements = [];
  });

  afterEach(() => {
    elements.forEach((element) => element.remove());
  });

  it('copies the rounded background of the given element', () => {
    const background = createElement('background: red; border-radius: 10px;');
    const label = createElement('width: 100px; height: 20px;', 'Files');
    elements.push(background, label);

    const preview = drawDragPreview(label, background);

    expect(alphaAt(preview, 0, 0)).to.equal(0);
    expect(alphaAt(preview, Math.floor(preview.width / 2), 1)).to.equal(255);
  });

  it('copies the dragged element background by default', () => {
    const label = createElement('width: 100px; height: 20px; background: red;', 'Files');
    elements.push(label);

    const preview = drawDragPreview(label);

    expect(alphaAt(preview, 0, 0)).to.equal(255);
  });

  it('stays off screen and out of the way of the pointer', () => {
    const label = createElement('width: 100px; height: 20px;', 'Files');
    elements.push(label);

    const preview = drawDragPreview(label);

    expect(preview.style.position).to.equal('fixed');
    expect(preview.style.pointerEvents).to.equal('none');
    expect(parseFloat(preview.style.left) < 0).to.be.true;
  });
});

import { expect } from '@esm-bundle/chai';
import { isColorCode } from '../../../../../blocks/canvas/editor-utils/color-code.js';

describe('isColorCode', () => {
  it('matches 3- and 6-digit hex colors', () => {
    expect(isColorCode('#fff')).to.equal(true);
    expect(isColorCode('#1a2b3c')).to.equal(true);
  });

  it('matches rgb/rgba colors', () => {
    expect(isColorCode('rgb(255, 0, 0)')).to.equal(true);
    expect(isColorCode('rgba(255, 0, 0, 0.5)')).to.equal(true);
  });

  it('matches gradients', () => {
    expect(isColorCode('linear-gradient(to right, red, blue)')).to.equal(true);
  });

  it('does not match plain text or empty values', () => {
    expect(isColorCode('blue')).to.equal(false);
    expect(isColorCode('')).to.equal(false);
    expect(isColorCode(undefined)).to.equal(false);
  });
});

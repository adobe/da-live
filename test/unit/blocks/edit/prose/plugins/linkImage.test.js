import { expect } from '@esm-bundle/chai';
import { isEditableLinkImage } from '../../../../../../blocks/edit/prose/plugins/linkImage.js';

const node = (name, attrs = {}) => ({ type: { name }, attrs });

describe('isEditableLinkImage', () => {
  it('is true for an image with editAs image', () => {
    expect(isEditableLinkImage(node('image', { editAs: 'image' }))).to.be.true;
  });

  it('is false for a normal image', () => {
    expect(isEditableLinkImage(node('image', { editAs: null }))).to.be.false;
  });

  it('is false for a non-image node', () => {
    expect(isEditableLinkImage(node('paragraph', { editAs: 'image' }))).to.be.false;
  });

  it('is false for null or undefined', () => {
    expect(isEditableLinkImage(null)).to.be.false;
    expect(isEditableLinkImage(undefined)).to.be.false;
  });
});

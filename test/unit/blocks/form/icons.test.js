import { expect } from '@esm-bundle/chai';
import '../../setup-nx.js';
import { nothing } from 'da-lit';
import { icon } from '../../../../blocks/form/icons.js';

// icons.js preloads its sprites via `loadHrefSvg` (from `${codeBase}/img/icons`).
// That fetch isn't wired in the test environment, so the loaded-glyph path
// can't be exercised here (same as schema-editor / media-library). These tests
// pin the helper's contract: it stays exported and degrades to `nothing`
// instead of throwing for names it can't resolve.
describe('form icon() helper', () => {
  it('is exported as a function', () => {
    expect(icon).to.be.a('function');
  });

  it('returns nothing for an unknown icon name', () => {
    expect(icon('does-not-exist')).to.equal(nothing);
  });

  it('returns nothing when called without a name', () => {
    expect(icon()).to.equal(nothing);
  });

  it('does not throw when given a class name for an unresolved icon', () => {
    expect(() => icon('does-not-exist', 'some-class')).to.not.throw();
  });
});

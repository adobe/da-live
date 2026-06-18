import { expect } from '@esm-bundle/chai';
import {
  getFavorites,
  isFavorite,
  toggleFavorite,
} from '../../../../../blocks/browse/shared/favorites.js';

const KEY = 'da-favorites';

describe('favorites util', () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  it('returns empty array for unknown folder', () => {
    expect(getFavorites('/unknown')).to.deep.equal([]);
  });

  it('returns empty array when localStorage has malformed JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(getFavorites('/anything')).to.deep.equal([]);
  });

  it('toggleFavorite adds, then removes, an item path', () => {
    const folder = '/org/site/folder';
    const item = '/org/site/folder/page';
    expect(toggleFavorite(folder, item)).to.equal(true);
    expect(isFavorite(folder, item)).to.equal(true);
    expect(getFavorites(folder)).to.deep.equal([item]);
    expect(toggleFavorite(folder, item)).to.equal(false);
    expect(isFavorite(folder, item)).to.equal(false);
  });

  it('removes the storage key entry when last favorite is removed', () => {
    const folder = '/org/site/folder';
    const item = '/org/site/folder/only';
    toggleFavorite(folder, item);
    toggleFavorite(folder, item);
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      expect(parsed[folder]).to.equal(undefined);
    }
  });

  it('keeps favorites for different folders isolated', () => {
    toggleFavorite('/a', '/a/x');
    toggleFavorite('/b', '/b/y');
    expect(getFavorites('/a')).to.deep.equal(['/a/x']);
    expect(getFavorites('/b')).to.deep.equal(['/b/y']);
    expect(isFavorite('/a', '/b/y')).to.equal(false);
  });

  it('returns false from is/get/toggle when args are missing', () => {
    expect(isFavorite('', '/x')).to.equal(false);
    expect(isFavorite('/a', '')).to.equal(false);
    expect(getFavorites('')).to.deep.equal([]);
    expect(toggleFavorite('', '/x')).to.equal(false);
  });
});

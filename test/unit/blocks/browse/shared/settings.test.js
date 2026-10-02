import { expect } from '@esm-bundle/chai';
import { getBrowseSettings, updateBrowseSettings } from '../../../../../blocks/browse/shared/settings.js';

describe('browse settings', () => {
  let storageDescriptor;

  beforeEach(() => {
    storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, value: sessionStorage });
    localStorage.removeItem('da-browse-settings');
  });

  afterEach(() => {
    localStorage.removeItem('da-browse-settings');
    Object.defineProperty(window, 'localStorage', storageDescriptor);
  });

  it('returns an empty object before any preferences are saved', () => {
    expect(getBrowseSettings()).to.deep.equal({});
  });

  it('merges preferences without removing other fields', () => {
    updateBrowseSettings({ layout: 'list', rowSize: 'm', flattenFolders: true });
    updateBrowseSettings({ flattenFolders: false });
    expect(getBrowseSettings()).to.deep.equal({ layout: 'list', rowSize: 'm', flattenFolders: false });
  });

  it('recovers from malformed JSON and non-object settings', () => {
    for (const invalid of ['{broken', '[]', 'null', '"text"']) {
      localStorage.setItem('da-browse-settings', invalid);
      expect(getBrowseSettings()).to.deep.equal({});
    }
    updateBrowseSettings({ flattenFolders: false });
    expect(getBrowseSettings()).to.deep.equal({ flattenFolders: false });
  });
});

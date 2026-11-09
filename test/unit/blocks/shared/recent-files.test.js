import { expect } from '@esm-bundle/chai';
import { addRecentFile, getRecentFiles } from '../../../../blocks/shared/recent-files.js';

describe('recent files', () => {
  beforeEach(() => localStorage.removeItem('da-recent-files'));
  afterEach(() => localStorage.removeItem('da-recent-files'));

  it('keeps the newest opened file first without duplicates', () => {
    addRecentFile('/org/site/a.html');
    addRecentFile('/org/site/de/b.html');
    addRecentFile('/org/site/a.html');
    expect(getRecentFiles('/org/site')).to.deep.equal(['/org/site/a.html', '/org/site/de/b.html']);
  });

  it('keeps 18 files per site and separates sites', () => {
    Array.from({ length: 20 }, (_, i) => addRecentFile(`/org/site/${i}.html`));
    addRecentFile('/org/other/a.json');
    expect(getRecentFiles('/org/site')).to.have.length(18);
    expect(getRecentFiles('/org/site')[0]).to.equal('/org/site/19.html');
    expect(getRecentFiles('/org/other')).to.deep.equal(['/org/other/a.json']);
  });

  it('ignores paths outside a site and invalid stored data', () => {
    addRecentFile('/org/site');
    addRecentFile('org/site/a.html');
    expect(getRecentFiles('/org/site')).to.deep.equal([]);
    localStorage.setItem('da-recent-files', '[1]');
    expect(getRecentFiles('/org/site')).to.deep.equal([]);
  });

  it('filters malformed saved paths without changing other sites when recording an open', () => {
    localStorage.setItem('da-recent-files', JSON.stringify({
      '/org/site': ['/org/site/a.html', null, 42, '/org/site/b.html'],
      '/org/other': ['/org/other/a.json'],
    }));
    addRecentFile('/org/site/a.html');
    expect(JSON.parse(localStorage.getItem('da-recent-files'))).to.deep.equal({
      '/org/site': ['/org/site/a.html', '/org/site/b.html'],
      '/org/other': ['/org/other/a.json'],
    });
  });
});

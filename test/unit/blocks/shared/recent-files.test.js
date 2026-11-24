import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { addRecentFile, getRecentFiles, getRecentFileEntries } from '../../../../blocks/shared/recent-files.js';

describe('recent files', () => {
  beforeEach(() => localStorage.removeItem('da-recent-files'));
  afterEach(() => {
    sinon.restore();
    localStorage.removeItem('da-recent-files');
  });

  it('timestamps each opening, refreshing even the newest file without duplicates', () => {
    const now = sinon.stub(Date, 'now').returns(1000);
    addRecentFile('/org/site/a.html');
    expect(JSON.parse(localStorage.getItem('da-recent-files'))['/org/site']).to.deep.equal([
      { path: '/org/site/a.html', timestamp: 1000 },
    ]);
    now.returns(2000);
    addRecentFile('/org/site/de/b.html');
    now.returns(3000);
    addRecentFile('/org/site/a.html');
    expect(getRecentFiles('/org/site')).to.deep.equal(['/org/site/a.html', '/org/site/de/b.html']);
    expect(JSON.parse(localStorage.getItem('da-recent-files'))['/org/site']).to.deep.equal([
      { path: '/org/site/a.html', timestamp: 3000 },
      { path: '/org/site/de/b.html', timestamp: 2000 },
    ]);
    now.returns(4000);
    addRecentFile('/org/site/a.html');
    expect(JSON.parse(localStorage.getItem('da-recent-files'))['/org/site']).to.deep.equal([
      { path: '/org/site/a.html', timestamp: 4000 },
      { path: '/org/site/de/b.html', timestamp: 2000 },
    ]);
  });

  it('reads legacy and mixed entries as paths without rewriting or timestamping history', () => {
    const stored = JSON.stringify({
      '/org/legacy': ['/org/legacy/a.html', '/org/legacy/b.html'],
      '/org/site': [
        '/org/site/a.html',
        { path: '/org/site/b.html', timestamp: 1000 },
        '/org/site/c.html',
        null, 42, {}, { path: 42 },
      ],
    });
    localStorage.setItem('da-recent-files', stored);
    expect(getRecentFiles('/org/legacy')).to.deep.equal(['/org/legacy/a.html', '/org/legacy/b.html']);
    expect(getRecentFiles('/org/site')).to.deep.equal([
      '/org/site/a.html', '/org/site/b.html', '/org/site/c.html',
    ]);
    expect(getRecentFiles('/org/missing')).to.deep.equal([]);
    expect(localStorage.getItem('da-recent-files')).to.equal(stored);
  });

  it('converts only the reopened legacy path and deduplicates both entry formats', () => {
    sinon.stub(Date, 'now').returns(2000);
    localStorage.setItem('da-recent-files', JSON.stringify({
      '/org/site': [
        '/org/site/a.html',
        { path: '/org/site/b.html', timestamp: 1000 },
        '/org/site/c.html',
        { path: '/org/site/a.html', timestamp: 500 },
        null, 42, {},
      ],
      '/org/other': ['/org/other/legacy.html'],
    }));
    addRecentFile('/org/site/a.html');
    expect(JSON.parse(localStorage.getItem('da-recent-files'))).to.deep.equal({
      '/org/site': [
        { path: '/org/site/a.html', timestamp: 2000 },
        { path: '/org/site/b.html', timestamp: 1000 },
        '/org/site/c.html',
      ],
      '/org/other': ['/org/other/legacy.html'],
    });
    expect(getRecentFiles('/org/site')).to.deep.equal([
      '/org/site/a.html', '/org/site/b.html', '/org/site/c.html',
    ]);
  });

  it('reads only valid timestamped entries for the requested site without changing history', () => {
    const stored = JSON.stringify({
      '/org/site': [
        '/org/site/legacy.html',
        { path: '/org/site/a.html', timestamp: 1000 },
        { path: '/org/site/b.html' },
        { path: '/org/site/c.html', timestamp: '2000' },
        { path: '/org/site/d.html', timestamp: -1 },
        { path: '/org/other/e.html', timestamp: 3000 },
        null, 42, {},
      ],
      '/org/invalid': 'not an array',
    });
    localStorage.setItem('da-recent-files', stored);
    expect(getRecentFileEntries('/org/site')).to.deep.equal([
      { path: '/org/site/a.html', timestamp: 1000 },
    ]);
    expect(getRecentFileEntries('/org/missing')).to.deep.equal([]);
    expect(getRecentFileEntries('/org/invalid')).to.deep.equal([]);
    expect(localStorage.getItem('da-recent-files')).to.equal(stored);
  });

  it('keeps 18 files per site and separates sites', () => {
    sinon.stub(Date, 'now').returns(1000);
    Array.from({ length: 20 }, (_, i) => addRecentFile(`/org/site/${i}.html`));
    addRecentFile('/org/other/a.json');
    expect(getRecentFiles('/org/site')).to.deep.equal(
      Array.from({ length: 18 }, (_, i) => `/org/site/${19 - i}.html`),
    );
    expect(getRecentFiles('/org/other')).to.deep.equal(['/org/other/a.json']);
    const stored = JSON.parse(localStorage.getItem('da-recent-files'));
    expect(stored['/org/site']).to.have.length(18);
    expect(stored['/org/site'].every((entry) => entry.timestamp === 1000)).to.equal(true);
    expect(stored['/org/other']).to.deep.equal([{ path: '/org/other/a.json', timestamp: 1000 }]);
  });

  it('applies the cap to mixed history without converting unopened legacy entries', () => {
    const history = Array.from({ length: 18 }, (_, i) => (i % 2
      ? { path: `/org/site/${i}.html`, timestamp: i } : `/org/site/${i}.html`));
    localStorage.setItem('da-recent-files', JSON.stringify({ '/org/site': history }));
    sinon.stub(Date, 'now').returns(2000);
    addRecentFile('/org/site/new.html');
    expect(JSON.parse(localStorage.getItem('da-recent-files'))['/org/site']).to.deep.equal([
      { path: '/org/site/new.html', timestamp: 2000 }, ...history.slice(0, 17),
    ]);
    expect(getRecentFiles('/org/site')).to.deep.equal([
      '/org/site/new.html', ...Array.from({ length: 17 }, (_, i) => `/org/site/${i}.html`),
    ]);
  });

  it('ignores non-string and incomplete file paths', () => {
    [
      42,
      'org/site/a.html',
      '/org/site',
      '//site/a.html',
      '/org//a.html',
      '/org/site/',
    ].forEach(addRecentFile);
    expect(localStorage.getItem('da-recent-files')).to.equal(null);
  });

  it('tolerates malformed or unavailable local storage', () => {
    localStorage.setItem('da-recent-files', '{');
    expect(getRecentFiles('/org/site')).to.deep.equal([]);
    expect(getRecentFileEntries('/org/site')).to.deep.equal([]);

    sinon.stub(Storage.prototype, 'getItem').throws();
    sinon.stub(Storage.prototype, 'setItem').throws();
    expect(getRecentFiles('/org/site')).to.deep.equal([]);
    expect(getRecentFileEntries('/org/site')).to.deep.equal([]);
    expect(() => addRecentFile('/org/site/a.html')).not.to.throw();
  });
});

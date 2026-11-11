import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { addRecentFile, getRecentFiles } from '../../../../blocks/shared/recent-files.js';

describe('recent files', () => {
  beforeEach(() => localStorage.removeItem('da-recent-files'));
  afterEach(() => {
    sinon.restore();
    localStorage.removeItem('da-recent-files');
  });

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

    sinon.stub(Storage.prototype, 'getItem').throws();
    sinon.stub(Storage.prototype, 'setItem').throws();
    expect(getRecentFiles('/org/site')).to.deep.equal([]);
    expect(() => addRecentFile('/org/site/a.html')).not.to.throw();
  });
});

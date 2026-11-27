import { expect } from '@esm-bundle/chai';
import {
  setNx, sanitizePath, sanitizePathParts, sanitizeName, setPageTitle, parseSubdomain,
} from '../../../scripts/utils.js';

describe('Libs', () => {
  it('Default Libs', () => {
    const libs = setNx('/nx');
    expect(libs).to.equal('https://main--da-nx--adobe.aem.live/nx');
  });

  it('Default NX on production / CDN', () => {
    const location = { hostname: 'da.live' };
    const libs = setNx('/nx', location);
    expect(libs).to.equal('/nx');
  });

  it('Supports NX query param on production', () => {
    const location = {
      hostname: 'da.live',
      search: '?nx=foo',
    };
    const libs = setNx('/nx', location);
    expect(libs).to.equal('https://foo--da-nx--adobe.aem.live/nx');
  });

  it('Supports NX query param', () => {
    const location = {
      hostname: 'localhost',
      search: '?nx=foo',
    };
    const libs = setNx('/nx', location);
    expect(libs).to.equal('https://foo--da-nx--adobe.aem.live/nx');
  });

  it('Supports local NX query param', () => {
    const location = {
      hostname: 'localhost',
      search: '?nx=local',
    };
    const libs = setNx('/nx', location);
    expect(libs).to.equal('http://localhost:6456/nx');
  });

  describe('sanitizeName', () => {
    it('Sanitizes name', async () => {
      expect(sanitizeName(undefined)).to.equal(null);
      expect(sanitizeName('')).to.equal(null);
      expect(sanitizeName('Geö métrixX')).to.equal('geo-metrixx');
      expect(sanitizeName('Geö métrixX.jpg')).to.equal('geo-metrixx.jpg');
      expect(sanitizeName('.da')).to.equal('.da');
    });

    it('Sanitizes name without preserving dots', async () => {
      expect(sanitizeName('branch.name', false)).to.equal('branch-name');
    });
  });

  describe('parseSubdomain', () => {
    it('Extracts org and site from AEM URLs', () => {
      ['hlx.live', 'hlx.page', 'aem.live', 'aem.page'].forEach((domain) => {
        expect(parseSubdomain(`https://main--my-site--my-org.${domain}/`))
          .to.equal('#/my-org/my-site');
      });
    });

    it('Accepts paths, query parameters and the default HTTPS port', () => {
      expect(parseSubdomain('https://main--repo--org.aem.page:443/folder/page?preview=1#content'))
        .to.equal('#/org/repo');
    });

    it('Rejects non-HTTPS URLs', () => {
      ['http', 'ftp'].forEach((protocol) => {
        expect(parseSubdomain(`${protocol}://main--repo--org.aem.page/`)).to.equal(null);
      });
    });

    it('Rejects credentials and nonstandard ports', () => {
      [
        'https://user@main--repo--org.aem.page/',
        'https://:password@main--repo--org.aem.page/',
        'https://main--repo--org.aem.page:8443/',
      ].forEach((href) => {
        expect(parseSubdomain(href)).to.equal(null);
      });
    });

    it('Rejects lookalike domains and additional hostname labels', () => {
      [
        'https://main--repo--org.notaem.page/',
        'https://main--repo--org.aem.page.example.com/',
        'https://main--repo--org.extra.aem.page/',
      ].forEach((href) => {
        expect(parseSubdomain(href)).to.equal(null);
      });
    });

    it('Requires exactly three non-empty hostname parts', () => {
      [
        'https://main--repo--org--extra.aem.page/',
        'https://--repo--org.aem.page/',
        'https://main----org.aem.page/',
        'https://main--repo--.aem.page/',
      ].forEach((href) => {
        expect(parseSubdomain(href)).to.equal(null);
      });
    });

    it('Returns null for non-AEM, incomplete or invalid URLs', () => {
      expect(parseSubdomain('https://example.com/')).to.equal(null);
      expect(parseSubdomain('https://main--repo.hlx.live/')).to.equal(null);
      expect(parseSubdomain('not a url')).to.equal(null);
    });
  });

  describe('sanitizePath', () => {
    it('Handles root path', () => {
      expect(sanitizePath('/file.txt')).to.equal('/file.txt');
    });

    it('Sanitizes path with spaces', () => {
      expect(sanitizePath('/new folder/my file.txt')).to.equal('/new-folder/my-file.txt');
    });

    it('Sanitizes path with special or uppercase characters', () => {
      expect(sanitizePath('/café/résumé')).to.equal('/cafe/resume');
      expect(sanitizePath('/hello@world/file#1!')).to.equal('/hello-world/file-1');
      expect(sanitizePath('/my---folder/file!!!.json')).to.equal('/my-folder/file.json');
      expect(sanitizePath('/My Folder/File.JSON')).to.equal('/my-folder/file.json');
    });

    it('Removes empty path parts except if at the end', () => {
      expect(sanitizePath('/!!!/geometrixx')).to.equal('/geometrixx');
      expect(sanitizePath('//adobe/geometrixx/')).to.equal('/adobe/geometrixx/');
    });

    it('Preserves dots in path parts', () => {
      const path = '/.da/config.json';
      expect(sanitizePath(path)).to.equal('/.da/config.json');
    });

    it('Protects against path traversal attacks', () => {
      const path = './../../../etc/password';
      expect(sanitizePath(path)).to.equal('/etc/password');
    });
  });

  describe('sanitizePathParts', () => {
    it('Returns array of sanitized path parts', () => {
      const path = '/New folder/Geo metrixx.jpg';
      const parts = sanitizePathParts(path);
      expect(parts).to.deep.equal(['new-folder', 'geo-metrixx.jpg']);
    });

    it('Handles single file path', () => {
      const path = '/file.html';
      const parts = sanitizePathParts(path);
      expect(parts).to.deep.equal(['file.html']);
    });

    it('Handles paths with special characters in each part', () => {
      const path = '/hello@world/test#folder/file!.doc';
      const parts = sanitizePathParts(path);
      expect(parts).to.deep.equal(['hello-world', 'test-folder', 'file.doc']);
    });

    it('Handles path with no extension', () => {
      const path = '/folder/README';
      const parts = sanitizePathParts(path);
      expect(parts).to.deep.equal(['folder', 'readme']);
    });

    it('Sanitizes basename and extension separately', () => {
      const path = '/folder/HELLO WORLD.TXT';
      const parts = sanitizePathParts(path);
      expect(parts).to.deep.equal(['folder', 'hello-world.txt']);
    });

    it('Handles accented characters in path parts', () => {
      const path = '/café/naïve/résumé.pdf';
      const parts = sanitizePathParts(path);
      expect(parts).to.deep.equal(['cafe', 'naive', 'resume.pdf']);
    });

    it('Removes consecutive dashes', () => {
      const path = '/my---folder/file!!!name.txt';
      const parts = sanitizePathParts(path);
      expect(parts).to.deep.equal(['my-folder', 'file-name.txt']);
    });

    it('Removes trailing dashes from parts', () => {
      const path = '/folder-/file--';
      const parts = sanitizePathParts(path);
      expect(parts).to.deep.equal(['folder', 'file']);
    });

    it('Retains leading dashes in parts', () => {
      const path = '/-folder/--file';
      const parts = sanitizePathParts(path);
      expect(parts).to.deep.equal(['-folder', '-file']);
    });

    it('Retains underscores in folder segments', () => {
      const path = '/my_folder/file';
      const parts = sanitizePathParts(path);
      expect(parts).to.deep.equal(['my_folder', 'file']);
    });

    it('Strips underscores from last segment', () => {
      const path = '/my_folder/My_file';
      const parts = sanitizePathParts(path);
      expect(parts).to.deep.equal(['my_folder', 'my-file']);
    });
  });
});

describe('setPageTitle', () => {
  let title;
  beforeEach(() => { title = document.title; });
  afterEach(() => { document.title = title; });

  it('appends the product name to the page name', () => {
    setPageTitle('Edit page');
    expect(document.title).to.equal('Edit page | Experience Workspace');
  });

  it('uses only the product name without a page name', () => {
    setPageTitle();
    expect(document.title).to.equal('Experience Workspace');
    setPageTitle('');
    expect(document.title).to.equal('Experience Workspace');
  });
});

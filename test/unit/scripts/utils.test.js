import { expect } from '@esm-bundle/chai';
import {
  setNx, sanitizePath, sanitizePathParts, sanitizeName, getHomeHref, getNavigationHref,
} from '../../../scripts/utils.js';

describe('landing navigation links', () => {
  const currentHref = 'https://lp--da-live--adobe.aem.live/?landing=true&nx=lp&quick-edit=devlive&theme=light&nxver=2#/org/site';

  it('keeps the preview shell and landing return on sidebar and app destinations', () => {
    ['/apps', '/marketplace', '/apps/loc'].forEach((href) => {
      const url = new URL(getNavigationHref({ href, currentHref }));
      expect(url.origin).to.equal(new URL(currentHref).origin);
      expect(url.pathname).to.equal(href);
      expect(url.searchParams.get('nx')).to.equal('lp');
      expect(url.searchParams.get('nxver')).to.equal('2');
      expect(url.searchParams.get('quick-edit')).to.equal('devlive');
      expect(url.searchParams.get('theme')).to.equal('light');
      expect(url.searchParams.get('landing')).to.equal('home');
      expect(new URL(getHomeHref({ href: url.href })).searchParams.get('landing')).to.equal('true');
    });
  });

  it('keeps published internal app links on the current preview origin', () => {
    ['https://da.live', 'https://da.page'].forEach((origin) => {
      const url = new URL(getNavigationHref({ href: `${origin}/apps/scheduler`, currentHref }));
      expect(url.origin).to.equal(new URL(currentHref).origin);
      expect(url.searchParams.get('nx')).to.equal('lp');
    });
  });

  it('preserves explicit destination settings and workspace hashes', () => {
    const url = new URL(getNavigationHref({
      href: '/apps?nx=other&theme=dark&landing=false#/other/site',
      currentHref,
    }));
    expect(url.searchParams.get('nx')).to.equal('other');
    expect(url.searchParams.get('theme')).to.equal('dark');
    expect(url.searchParams.get('landing')).to.equal('false');
    expect(url.hash).to.equal('#/other/site');
  });

  it('does not leak preview settings to external destinations', () => {
    ['https://www.aem.live/docs/ew/about', 'https://tools.aem.live/', 'mailto:user@example.com'].forEach((href) => {
      expect(getNavigationHref({ href, currentHref })).to.equal(href);
    });
  });

  it('leaves non-opted-in navigation unchanged', () => {
    expect(getNavigationHref({ href: '/apps', currentHref: 'https://da.live/?nx=lp' })).to.equal('/apps');
  });
});

describe('landing Home destination', () => {
  it('leaves ordinary Home navigation unconfigured', () => {
    expect(getHomeHref({ href: 'https://da.live/canvas?nx=lp#/org/site/page' })).to.equal(undefined);
    expect(getHomeHref({ href: 'https://da.live/?landing=false' })).to.equal(undefined);
  });

  it('returns to the selected workspace from Browse and editors without losing preview flags', () => {
    const url = new URL(getHomeHref({ href: 'https://da.live/canvas?landing=home&browse=2&nx=lp&quick-edit=devlive&theme=light#/org/site/folder/page' }));
    expect(url.pathname).to.equal('/');
    expect(url.hash).to.equal('#/org/site');
    expect(url.searchParams.get('landing')).to.equal('true');
    expect(url.searchParams.has('browse')).to.equal(false);
    expect(url.searchParams.get('nx')).to.equal('lp');
    expect(url.searchParams.get('quick-edit')).to.equal('devlive');
    expect(url.searchParams.get('theme')).to.equal('light');
  });

  it('returns to workspace selection without inventing a site for empty or authentication hashes', () => {
    ['#', '#/org', '#access_token=token'].forEach((hash) => {
      expect(new URL(getHomeHref({ href: `https://da.live/?landing=true${hash}` })).hash).to.equal('');
    });
  });
});

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

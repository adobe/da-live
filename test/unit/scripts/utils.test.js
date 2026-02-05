import { expect } from '@esm-bundle/chai';
import { setNx, sanitizePath, sanitizePathParts, sanitizeName } from '../../../scripts/utils.js';

describe('Libs', () => {
  it('Default Libs', () => {
    const libs = setNx('/nx');
    expect(libs).to.equal('https://main--da-nx--adobe.aem.live/nx');
  });

  it('Supports NX query param on da.live', () => {
    const location = {
      hostname: 'da.live',
      search: '?nx=foo',
    };
    const libs = setNx('/nx', location);
    expect(libs).to.equal('https://foo--da-nx--adobe.aem.live/nx');
  });

  it('Returns nxBase for non-whitelisted domains (test fixtures)', () => {
    const location = {
      hostname: 'example.com',
      search: '?nx=foo',
    };
    const libs = setNx('/test/fixtures/nx', location);
    expect(libs).to.equal('/test/fixtures/nx');
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

    it('Retains underscores in folders', () => {
      const path = '/my_folder/file';
      const parts = sanitizePathParts(path);
      expect(parts).to.deep.equal(['my_folder', 'file']);
    });

    it('Retains underscores in folders, but not on files', () => {
      const path = '/my_folder/file_with_underscore.txt';
      const sanitizedPath  = sanitizePath(path);
      expect(sanitizedPath).to.deep.equal('/my_folder/file-with-underscore.txt');
    });
  });
});

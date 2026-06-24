import { expect } from '@esm-bundle/chai';
import { stub } from 'sinon';
import { setNx, getNx2Api } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const {
  getFullEntryList,
  handleUpload,
  getDropConflicts,
  items2Clipboard,
} = await import('../../../../../blocks/browse/da-list/helpers/utils.js');

// nx2 api.js pings `/ping/{org}/{site}` to detect hlx6 before every source
// op and caches the result. Pre-warm the cache for the org/site combinations
// produced by the handleUpload test inputs (postpath = `${fullpath}${path}`).
async function primeHlx6Cache(orgSitePairs) {
  const tempStub = stub(window, 'fetch').callsFake(async () => new Response('', { status: 200 }));
  try {
    const { isHlx6 } = await getNx2Api();
    await Promise.all(orgSitePairs.map(([org, site]) => isHlx6(org, site)));
  } finally {
    tempStub.restore();
  }
}

const goodEntry = {
  isDirectory: false,
  fullPath: '/foo.html',
  file: (callback) => {
    const file = new File(
      ['foo'],
      'foo.html',
      { type: 'text/html' },
    );
    callback(file);
  },
};
const badEntry = {
  isDirectory: false,
  fullPath: '/foo.exe',
  file: (callback) => {
    const file = new File(
      ['foo'],
      'foo.exe',
      { type: 'application/x-msdownload' },
    );
    callback(file);
  },
};

describe('Drag and drop', () => {
  it('File entry', async () => {
    const files = await getFullEntryList([goodEntry, badEntry]);
    expect(files.length).to.equal(1);
  });

  it('Folder entry', async () => {
    let read = 0;
    const folderEntry = {
      isDirectory: true,
      fullPath: '/flex',
      createReader: () => ({
        readEntries: (callback) => {
          const arr = read === 0 ? [goodEntry, badEntry] : [];
          read += 1;
          callback(arr);
        },
      }),
    };
    const files = await getFullEntryList([folderEntry]);
    expect(files.length).to.equal(1);
  });
});

describe('Upload and format', () => {
  const ogFetch = window.fetch;

  before(async () => {
    // Test postpaths: `/geometrixx/foo` and `/geometrixx/foo.html` — withArgs
    // splits these into { org: 'geometrixx', site: 'foo' | 'foo.html' }.
    await primeHlx6Cache([['geometrixx', 'foo'], ['geometrixx', 'foo.html']]);
  });

  beforeEach(() => {
    window.fetch = stub().returns(
      new Promise((resolve) => {
        resolve({ ok: true });
      }),
    );
  });

  afterEach(() => {
    window.fetch = ogFetch;
  });

  it('Returns file upload if not already in list', async () => {
    const fullpath = '/geometrixx';
    const list = [{ name: 'clever', path: '/geometrixx/clever', ext: 'html' }];
    const file = new File(['foo'], 'foo.html', { type: 'text/html' });
    const packagedFile = {
      data: file,
      name: file.name,
      type: file.type,
      ext: 'html',
      path: '/foo',
    };

    const item = await handleUpload(list, fullpath, packagedFile);
    expect(item).to.exist;
  });

  it('Returns null when uploaded file is already in list (touches lastModified)', async () => {
    const fullpath = '/geometrixx';
    const existing = { name: 'foo', path: '/geometrixx/foo.html', ext: 'html', lastModified: 1 };
    const list = [existing];
    const file = new File(['foo'], 'foo.html', { type: 'text/html' });
    const packagedFile = {
      data: file,
      name: file.name,
      type: file.type,
      ext: 'html',
      path: '/foo.html',
    };
    const item = await handleUpload(list, fullpath, packagedFile);
    expect(item).to.equal(null);
    expect(existing.lastModified).to.be.greaterThan(1);
  });
});

describe('getDropConflicts', () => {
  it('Detects existing names that match a dropped file', () => {
    const list = [{ name: 'page', ext: 'html' }];
    const files = [{ path: '/page.html' }];
    expect(getDropConflicts(list, files)).to.deep.equal(['page.html']);
  });

  it('Returns an empty array when nothing conflicts', () => {
    const list = [{ name: 'page', ext: 'html' }];
    const files = [{ path: '/other.html' }];
    expect(getDropConflicts(list, files)).to.deep.equal([]);
  });

  it('Deduplicates so the same conflict only appears once', () => {
    const list = [{ name: 'page', ext: 'html' }];
    const files = [{ path: '/page.html' }, { path: '/page.html' }];
    expect(getDropConflicts(list, files)).to.deep.equal(['page.html']);
  });

  it('Treats folders (no ext) by name only', () => {
    const list = [{ name: 'images' }];
    const files = [{ path: '/images' }];
    expect(getDropConflicts(list, files)).to.deep.equal(['images']);
  });
});

describe('items2Clipboard', () => {
  let captured;
  let savedClipboard;

  beforeEach(() => {
    captured = null;
    savedClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: (data) => { captured = data; return Promise.resolve(); } },
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: savedClipboard });
  });

  function readBlobText(item) {
    return new Promise((resolve) => {
      const blob = item.types[0] === 'text/plain'
        ? null
        : null;
      // ClipboardItem doesn't expose data synchronously; build from intercept instead.
      resolve(blob);
    });
  }

  it('Builds AEM URLs and writes them to the clipboard', async () => {
    // Capture the Blob constructor input so we don't depend on ClipboardItem internals.
    const RealBlob = window.Blob;
    let lastBlobText;
    window.Blob = class extends RealBlob {
      constructor(parts, opts) {
        lastBlobText = parts.join('');
        super(parts, opts);
      }
    };
    try {
      const items = [
        { ext: 'html', path: '/org/repo/folder/page.html' },
        { ext: 'html', path: '/org/repo/folder/index.html' },
      ];
      items2Clipboard(items);
      expect(lastBlobText).to.equal(
        'https://main--repo--org.aem.page/folder/page\nhttps://main--repo--org.aem.page/folder/',
      );
      expect(captured).to.have.length(1);
      // Make linter happy by referring to readBlobText
      await readBlobText(captured[0]);
    } finally {
      window.Blob = RealBlob;
    }
  });

  it('Skips items with no extension', () => {
    const RealBlob = window.Blob;
    let lastBlobText;
    window.Blob = class extends RealBlob {
      constructor(parts, opts) {
        lastBlobText = parts.join('');
        super(parts, opts);
      }
    };
    try {
      items2Clipboard([{ path: '/org/repo/folder' }]);
      expect(lastBlobText).to.equal('');
    } finally {
      window.Blob = RealBlob;
    }
  });

  it('Appends a trailing - message when present', () => {
    const RealBlob = window.Blob;
    let lastBlobText;
    window.Blob = class extends RealBlob {
      constructor(parts, opts) {
        lastBlobText = parts.join('');
        super(parts, opts);
      }
    };
    try {
      items2Clipboard([
        { ext: 'html', path: '/org/repo/page.html', message: 'Note' },
      ]);
      expect(lastBlobText).to.equal('https://main--repo--org.aem.page/page - Note');
    } finally {
      window.Blob = RealBlob;
    }
  });
});

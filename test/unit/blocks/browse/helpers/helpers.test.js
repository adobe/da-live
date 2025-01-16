import { expect } from '@esm-bundle/chai';
import { stub } from 'sinon';
import { getFullEntryList, handleUpload, sanitizePath } from '../../../../../blocks/browse/da-list/helpers/drag-n-drop.js';

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

  it('Returns sanitize file path', async () => {
    const path = '/new folder/geo_metrixx.jpg';
    const item = sanitizePath(path);
    console.log('item', item);
    expect(item).to.equal('/new-folder/geo-metrixx.jpg');
  });
});

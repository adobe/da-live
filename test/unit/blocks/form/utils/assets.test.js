import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import {
  createAssetSources,
  uploadFile,
} from '../../../../../blocks/form/utils/assets.js';
import { SUPPORTED_IMAGE_TYPES } from '../../../../../blocks/shared/constants.js';

const ERRORS = {
  document: 'The form document path is unavailable for upload.',
  fileName: 'The file name is invalid.',
  fileType: 'This file type cannot be uploaded here.',
  response: 'The upload did not return a usable file URL.',
};

const details = { parent: '/example/site/forms', name: 'sample' };

const fileOf = ({ name, type = 'image/png' }) => new File([new Uint8Array(4)], name, { type });

const respondWith = (contentUrl) => async () => ({
  ok: true,
  json: async () => ({ source: { contentUrl } }),
});

const allowAnySize = async () => false;

const uploadWith = (options) => uploadFile({ details, refuseOversized: allowAnySize, ...options });

describe('form file upload', () => {
  it('uses the same document-scoped folder as Canvas, also for root documents', async () => {
    const paths = [];
    const upload = async (path) => {
      paths.push(path);
      return respondWith('./media_abc.png')();
    };
    const file = fileOf({ name: 'a.png' });
    await uploadWith({ file, upload });
    await uploadWith({ details: { ...details, parent: '/example/site', name: 'index' }, file, upload });
    expect(paths).to.deep.equal(['/example/site/forms/.sample/a.png', '/example/site/.index/a.png']);
  });

  it('rejects malformed file names and document paths before uploading', async () => {
    const upload = async () => { throw new Error('Should not upload.'); };
    expect(await uploadWith({ file: fileOf({ name: 'a?b.png' }), upload }))
      .to.deep.equal({ error: ERRORS.fileName });
    expect(await uploadWith({ file: fileOf({ name: 'a#b.png' }), upload }))
      .to.deep.equal({ error: ERRORS.fileName });
    expect(await uploadWith({ details: { ...details, parent: undefined }, file: fileOf({ name: 'a.png' }), upload }))
      .to.deep.equal({ error: ERRORS.document });
  });

  it('uploads to the document folder and keeps the returned Media Bus URL', async () => {
    const calls = [];
    const upload = async (path, { body }) => {
      calls.push({ path, body });
      return respondWith('./media_abc.png')();
    };
    const file = fileOf({ name: 'hero.png' });
    const result = await uploadWith({ file, upload });
    expect(calls).to.deep.equal([{ path: '/example/site/forms/.sample/hero.png', body: file }]);
    expect(result).to.deep.equal({ href: './media_abc.png', name: 'hero.png' });
  });

  it('accepts every Canvas image type', async () => {
    const upload = respondWith('./media_abc.png');
    const results = await Promise.all(SUPPORTED_IMAGE_TYPES
      .map((type) => uploadWith({ file: fileOf({ name: 'hero', type }), upload })));
    expect(results.map(({ href }) => href))
      .to.deep.equal(Array(SUPPORTED_IMAGE_TYPES.length).fill('./media_abc.png'));
  });

  it('validates by MIME type, like Canvas, before uploading', async () => {
    let uploads = 0;
    const upload = async () => {
      uploads += 1;
      return respondWith('./media_abc.png')();
    };
    const rejected = [
      fileOf({ name: 'song.mp3', type: 'audio/mpeg' }),
      fileOf({ name: 'clip.mp4', type: 'video/mp4' }),
      fileOf({ name: 'spec.pdf', type: 'application/pdf' }),
      fileOf({ name: 'hero.png', type: '' }),
    ];
    const results = await Promise.all(rejected.map((file) => uploadWith({ file, upload })));
    results.forEach((result) => expect(result).to.deep.equal({ error: ERRORS.fileType }));
    expect(uploads).to.equal(0);
  });

  it('reports failed uploads and unusable URLs', async () => {
    const file = fileOf({ name: 'hero.png' });
    expect(await uploadWith({ file, upload: async () => ({ ok: false, status: 403 }) }))
      .to.deep.equal({ error: 'Upload failed with status 403.' });
    expect(await uploadWith({ file, upload: respondWith(undefined) }))
      .to.deep.equal({ error: ERRORS.response });
  });

  it('cancels without uploading when the Canvas size check refuses the file', async () => {
    const checks = [];
    let uploads = 0;
    const upload = async () => {
      uploads += 1;
      return respondWith('./media_abc.png')();
    };
    const refuseOversized = async (bytes, parentPath) => {
      checks.push({ bytes, parentPath });
      return true;
    };
    const result = await uploadWith({ file: fileOf({ name: 'hero.png' }), upload, refuseOversized });
    expect(result).to.deep.equal({ cancelled: true });
    expect(checks).to.deep.equal([{ bytes: 4, parentPath: '/example/site/forms' }]);
    expect(uploads).to.equal(0);
  });
});

const REPO_CONFIG = { repositoryId: 'author-p1-e1.adobeaemcloud.com', tierType: 'author' };

const isCurrent = () => true;
const labelsOf = (sources) => sources.map(({ id, label }) => ({ id, label }));

describe('form asset sources', () => {
  it('offers only Upload without an AEM repository', () => {
    expect(labelsOf(createAssetSources({ details, isCurrent }))).to.deep.equal([
      { id: 'upload', label: 'Upload' },
    ]);
  });

  it('adds AEM Assets when the site has a repository', () => {
    const sources = createAssetSources({ details, repoConfig: REPO_CONFIG, isCurrent });
    expect(labelsOf(sources)).to.deep.equal([
      { id: 'upload', label: 'Upload' },
      { id: 'aem-assets', label: 'AEM Assets' },
    ]);
  });

  it('lets Upload pick only Canvas image types and AEM Assets pick in its own selector', () => {
    const [upload, aem] = createAssetSources({ details, repoConfig: REPO_CONFIG, isCurrent });
    expect(upload.fileTypes).to.deep.equal(SUPPORTED_IMAGE_TYPES);
    expect(aem.fileTypes).to.equal(undefined);
  });

  it('limits Upload to image fields and leaves AEM Assets open to every field', () => {
    const [upload, aem] = createAssetSources({ details, repoConfig: REPO_CONFIG, isCurrent });
    expect(upload.assetTypes).to.deep.equal(['image']);
    expect(aem.assetTypes).to.equal(undefined);
  });

  it('cancels a result that arrives after the document changed', async () => {
    let current = true;
    const [upload] = createAssetSources({ details, isCurrent: () => current });
    const file = new File(['x'], 'song.mp3', { type: 'audio/mpeg' });
    const pending = upload.select({ file });
    current = false;
    expect(await pending).to.deep.equal({ cancelled: true });
  });
});

import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import {
  createAssetSources,
  uploadFile,
} from '../../../../../blocks/form/utils/assets.js';

const ERRORS = {
  document: 'The form document path is unavailable for upload.',
  fileName: 'The file name is invalid.',
  fileType: 'This file type cannot be uploaded here.',
  response: 'The upload did not return a usable file URL.',
};

const details = { owner: 'example', repo: 'site', parent: '/example/site/forms', name: 'sample' };

const fileOf = ({ name, type = '' }) => new File([new Uint8Array(4)], name, { type });

const respondWith = (contentUrl) => async () => ({
  ok: true,
  json: async () => ({ source: { contentUrl } }),
});

describe('form file upload', () => {
  it('uses the same document-scoped folder as Canvas, also for root documents', async () => {
    const paths = [];
    const upload = async (path) => {
      paths.push(path);
      return respondWith('./media_abc.png')();
    };
    const file = fileOf({ name: 'a.png' });
    await uploadFile({ details, file, upload });
    await uploadFile({ details: { ...details, parent: '/example/site', name: 'index' }, file, upload });
    expect(paths).to.deep.equal(['/example/site/forms/.sample/a.png', '/example/site/.index/a.png']);
  });

  it('rejects malformed file names and document paths before uploading', async () => {
    const upload = async () => { throw new Error('Should not upload.'); };
    expect(await uploadFile({ details, file: fileOf({ name: 'a?b.png' }), upload }))
      .to.deep.equal({ error: ERRORS.fileName });
    expect(await uploadFile({ details, file: fileOf({ name: 'a#b.png' }), upload }))
      .to.deep.equal({ error: ERRORS.fileName });
    expect(await uploadFile({ details: { ...details, parent: undefined }, file: fileOf({ name: 'a.png' }), upload })).to.deep.equal({ error: ERRORS.document });
  });

  it('uploads to the document folder and keeps the returned Media Bus URL', async () => {
    const calls = [];
    const upload = async (path, { body }) => {
      calls.push({ path, body });
      return respondWith('./media_abc.png')();
    };
    const file = fileOf({ name: 'hero.png' });
    const result = await uploadFile({ details, file, upload });
    expect(calls).to.deep.equal([{ path: '/example/site/forms/.sample/hero.png', body: file }]);
    expect(result).to.deep.equal({ href: './media_abc.png', name: 'hero.png' });
  });

  it('accepts both JPEG extensions in any case', async () => {
    const upload = respondWith('./media_abc.jpg');
    const results = await Promise.all(['hero.jpg', 'hero.jpeg', 'HERO.JPG']
      .map((name) => uploadFile({ details, file: fileOf({ name }), upload })));
    expect(results.map(({ href }) => href)).to.deep.equal(Array(3).fill('./media_abc.jpg'));
  });

  it('validates by extension, like the upload API, and uploads only Canvas image types', async () => {
    let uploads = 0;
    const upload = async () => {
      uploads += 1;
      return respondWith('./media_abc.png')();
    };
    const rejected = [
      { file: fileOf({ name: 'song.mp3', type: 'audio/mpeg' }) },
      { file: fileOf({ name: 'clip.mp4', type: 'video/mp4' }) },
      { file: fileOf({ name: 'spec.pdf', type: 'application/pdf' }) },
      { file: fileOf({ name: 'photo.webp', type: 'image/webp' }) },
      { file: fileOf({ name: 'renamed.txt', type: 'image/png' }) },
    ];
    const results = await Promise.all(
      rejected.map(({ file }) => uploadFile({ details, file, upload })),
    );
    results.forEach((result) => expect(result).to.deep.equal({ error: ERRORS.fileType }));
    expect(uploads).to.equal(0);
  });

  it('reports failed uploads and unusable URLs', async () => {
    const file = fileOf({ name: 'hero.png' });
    expect(await uploadFile({ details, file, upload: async () => ({ ok: false, status: 403 }) }))
      .to.deep.equal({ error: 'Upload failed with status 403.' });
    expect(await uploadFile({ details, file, upload: respondWith(undefined) }))
      .to.deep.equal({ error: ERRORS.response });
  });

  it('applies the Canvas size limits before uploading', async () => {
    const MB = 1_000_000;
    const sized = (size) => ({ name: 'hero.png', size });
    const upload = respondWith('./media_abc.png');
    const probes = [];
    const site = ({ hlx6 }) => async (org, repo) => {
      probes.push({ org, repo });
      return hlx6;
    };
    const legacy = site({ hlx6: false });

    expect(await uploadFile({ details, file: sized(4.5 * MB), upload, checkHlx6: legacy }))
      .to.have.property('href');
    expect(probes).to.deep.equal([]);
    expect(await uploadFile({ details, file: sized(5 * MB), upload, checkHlx6: legacy }))
      .to.have.property('href');
    expect(probes).to.deep.equal([{ org: 'example', repo: 'site' }]);
    expect(await uploadFile({ details, file: sized(20 * MB + 1), upload, checkHlx6: legacy }))
      .to.deep.equal({ error: 'Max image size allowed is 20 MB' });
    expect(await uploadFile({ details, file: sized(5 * MB), upload, checkHlx6: site({ hlx6: true }) })).to.deep.equal({ error: 'Max image size allowed is 4.5 MB' });
    expect(await uploadFile({ details, file: sized(5 * MB), upload, checkHlx6: async () => { throw new Error('offline'); } })).to.have.property('href');
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
    expect(upload.fileTypes).to.deep.equal(['image/svg+xml', 'image/png', 'image/jpeg', 'image/gif']);
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

import { expect } from '@esm-bundle/chai';
import { getSchema } from 'da-parser';
import { EditorState } from 'da-y-wrapper';
import { parseDaRsVersion } from '../../../../../blocks/shared/version/da-rs-restore.js';

describe('bound version restore parsing', () => {
  it('replaces live editor content without dropping the snapshot heading, block or quote', () => {
    const schema = getSchema();
    const html = '<main><div><h1>Snapshot heading</h1><div class="columns"><div><div></div><div></div></div></div><blockquote><p>Snapshot quote</p></blockquote></div></main>';
    const current = EditorState.create({ schema });
    const editing = current.apply(current.tr.insertText('Edited after snapshot', 1));
    const version = parseDaRsVersion(html, schema);
    const replacement = editing.tr.replaceWith(0, editing.doc.content.size, version.content);
    const restored = editing.apply(replacement);

    expect(restored.doc.textContent).to.equal('Snapshot headingcolumnsSnapshot quote');
    const types = [];
    restored.doc.forEach((node) => types.push(node.type.name));
    expect(types).to.include.members(['heading', 'table', 'blockquote']);
    expect(version.type).to.equal(schema.topNodeType);
  });

  it('preserves authored image sources without parsing fetchable image URLs', async () => {
    const remote = 'https://outside.invalid/da-rs-restore-test.png';
    const local = './media_da_rs_restore_test.png';
    const html = `<body><header></header><main><div><p><picture><source srcset="${local}"><img src="${local}" alt="local"></picture></p><p><img src="${remote}" alt="remote"></p></div></main><footer></footer></body>`;
    const doc = parseDaRsVersion(html, getSchema());
    const sources = [];
    doc.descendants((node) => {
      if (node.type.name === 'image') sources.push(node.attrs.src);
    });
    expect(sources).to.deep.equal([local, remote]);
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    const requests = performance.getEntriesByType('resource').map((entry) => entry.name);
    expect(requests.some((url) => url.includes('da-rs-restore-test.png'))).to.equal(false);
    expect(requests.some((url) => url.includes('media_da_rs_restore_test.png'))).to.equal(false);
  });

  it('rejects resource-bearing styles rather than discarding authored attributes', () => {
    expect(() => parseDaRsVersion('<p style="background:url(https://outside.invalid/x)">x</p>', getSchema())).to.throw();
  });

  it('restores distinct sources when a version contains more than ten images', () => {
    const sources = Array.from({ length: 12 }, (_, index) => `./media_${index}.png`);
    const markup = sources.map((src) => `<p><img src="${src}"></p>`).join('');
    const doc = parseDaRsVersion(`<main><div>${markup}</div></main>`, getSchema());
    const actual = [];
    doc.descendants((node) => {
      if (node.type.name === 'image') actual.push(node.attrs.src);
    });
    expect(actual).to.deep.equal(sources);
  });
});

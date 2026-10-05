import { expect } from '@esm-bundle/chai';
import { nothing } from 'da-lit';
import DaPreview from '../../../../blocks/edit/da-preview/da-preview.js';

describe('DA preview metadata URL context', () => {
  let originalUrl;
  let originalView;

  beforeEach(() => {
    originalUrl = window.location.href;
    originalView = window.view;
  });

  afterEach(() => {
    history.replaceState(null, '', originalUrl);
    window.view = originalView;
  });

  function setRef(ref) {
    const url = new URL(window.location.href);
    url.searchParams.set('ref', ref);
    history.replaceState(null, '', url);
  }

  it('uses the same page URL for metadata and the visible iframe', () => {
    setRef('on');
    const preview = new DaPreview();
    preview.path = 'https://main--site--org.preview.da.live/en/index';
    preview.show = true;
    expect(preview._previewUrl).to.equal(
      'https://main--site--org.preview.da.live/en/?dapreview=on&martech=off',
    );
    expect(preview._source).to.equal(preview._previewUrl);
  });

  it('retains local preview URL context while the iframe is hidden', () => {
    setRef('local');
    const preview = new DaPreview();
    preview.path = 'https://main--site--org.preview.da.live/en/page';
    preview.show = false;
    expect(preview._source).to.equal(nothing);
    expect(preview._previewUrl).to.equal(
      'http://localhost:3001/en/page?dapreview=local&martech=off',
    );

    const editor = document.createElement('div');
    editor.innerHTML = `
      <p>Content</p>
      <div class="tableWrapper">
        <table>
          <tr><td>Section Metadata</td></tr>
          <tr><td>Source</td><td><a href="./related">Label</a></td></tr>
        </table>
      </div>
    `;
    window.view = {
      dom: editor,
      state: { selection: { from: 1 } },
      domAtPos: () => ({ node: editor.querySelector('p').firstChild, offset: 0 }),
    };
    preview.setBody();
    const doc = new DOMParser().parseFromString(preview.body, 'text/html');
    expect(doc.querySelector('main > div').dataset.source).to.equal(
      'http://localhost:3001/en/related',
    );
  });
});

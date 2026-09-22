import { expect } from '@esm-bundle/chai';
import { getMetadata } from '../../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/ootb/utils.js';

describe('getMetadata', () => {
  it('returns an empty object when no metadata element is given', () => {
    expect(getMetadata(null)).to.deep.equal({});
  });

  it('builds a lowercased key map with content element and text', () => {
    const doc = new DOMParser().parseFromString(`<html><body>
      <div class="metadata">
        <div><div>Title</div><div>My Page</div></div>
        <div><div>Description</div><div>A description.</div></div>
      </div>
    </body></html>`, 'text/html');
    const meta = doc.querySelector('.metadata');

    const result = getMetadata(meta);

    expect(result.title.text).to.equal('my page');
    expect(result.title.content.textContent.trim()).to.equal('My Page');
    expect(result.description.text).to.equal('a description.');
  });

  it('skips rows without children', () => {
    const doc = new DOMParser().parseFromString(`<html><body>
      <div class="metadata">
        Some stray text node
        <div><div>Title</div><div>My Page</div></div>
      </div>
    </body></html>`, 'text/html');
    const meta = doc.querySelector('.metadata');

    const result = getMetadata(meta);

    expect(Object.keys(result)).to.deep.equal(['title']);
  });
});

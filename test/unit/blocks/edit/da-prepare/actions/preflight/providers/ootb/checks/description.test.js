import { expect } from '@esm-bundle/chai';
import descriptionCheck from '../../../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/ootb/checks/description.js';

const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

describe('descriptionCheck', () => {
  it('returns info when description is found in metadata', () => {
    const doc = parse(`<html><body>
      <div class="metadata"><div><div>Description</div><div>My page description</div></div></div>
    </body></html>`);
    const { title, items, done } = descriptionCheck({ doc });

    expect(title).to.equal('Description');
    expect(done).to.be.true;
    expect(items[0].result).to.equal('info');
    expect(items[0].reason).to.equal('Description found in metadata.');
  });

  it('returns info when falling back to the first paragraph', () => {
    const doc = parse('<html><body><p>First paragraph text.</p></body></html>');
    const { items } = descriptionCheck({ doc });

    expect(items[0].result).to.equal('info');
    expect(items[0].reason).to.equal('Description found as first paragraph.');
  });

  it('returns warn when neither metadata description nor a paragraph is found', () => {
    const doc = parse('<html><body><h1>Only a heading</h1></body></html>');
    const { items } = descriptionCheck({ doc });

    expect(items[0].result).to.equal('warn');
  });
});

import { expect } from '@esm-bundle/chai';
import titleCheck from '../../../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/ootb/checks/title.js';

const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

describe('titleCheck', () => {
  it('returns info when title is found in metadata', () => {
    const doc = parse(`<html><body>
      <div class="metadata"><div><div>Title</div><div>My Page</div></div></div>
    </body></html>`);
    const { title, items, done } = titleCheck({ doc });

    expect(title).to.equal('Title');
    expect(done).to.be.true;
    expect(items[0].result).to.equal('info');
    expect(items[0].reason).to.equal('Title found in metadata.');
  });

  it('returns info when falling back to H1', () => {
    const doc = parse('<html><body><h1>My Page</h1></body></html>');
    const { items } = titleCheck({ doc });

    expect(items[0].result).to.equal('info');
    expect(items[0].reason).to.equal('Document using H1 as title.');
  });

  it('returns error when neither metadata title nor H1 is found', () => {
    const doc = parse('<html><body><p>No title here</p></body></html>');
    const { items } = titleCheck({ doc });

    expect(items[0].result).to.equal('error');
  });
});

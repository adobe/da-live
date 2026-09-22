import { expect } from '@esm-bundle/chai';
import loremCheck from '../../../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/ootb/checks/lorem.js';

const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

describe('loremCheck', () => {
  it('returns error when lorem ipsum text is present', () => {
    const doc = parse('<html><body><p>Lorem ipsum dolor sit amet.</p></body></html>');
    const { title, items, done } = loremCheck({ doc });

    expect(title).to.equal('Lorem ipsum');
    expect(done).to.be.true;
    expect(items[0].result).to.equal('error');
  });

  it('returns info when lorem ipsum text is absent', () => {
    const doc = parse('<html><body><p>Real content.</p></body></html>');
    const { items } = loremCheck({ doc });

    expect(items[0].result).to.equal('info');
  });
});

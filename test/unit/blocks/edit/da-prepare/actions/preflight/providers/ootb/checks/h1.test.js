import { expect } from '@esm-bundle/chai';
import h1Check from '../../../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/ootb/checks/h1.js';

const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

describe('h1Check', () => {
  it('returns info when exactly one H1 is found', () => {
    const doc = parse('<html><body><h1>Title</h1></body></html>');
    const { title, items, done } = h1Check({ doc });

    expect(title).to.equal('H1 count');
    expect(done).to.be.true;
    expect(items[0].result).to.equal('info');
  });

  it('returns warn when more than one H1 is found', () => {
    const doc = parse('<html><body><h1>One</h1><h1>Two</h1></body></html>');
    const { items } = h1Check({ doc });

    expect(items[0].result).to.equal('warn');
  });

  it('returns error when no H1 is found', () => {
    const doc = parse('<html><body><p>No heading</p></body></html>');
    const { items } = h1Check({ doc });

    expect(items[0].result).to.equal('error');
  });
});

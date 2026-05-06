/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../blocks/sheet/da-sheet-preview.js');

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('da-sheet-preview', () => {
  let el;

  async function fixture() {
    const element = document.createElement('da-sheet-preview');
    document.body.appendChild(element);
    await nextFrame();
    return element;
  }

  afterEach(() => {
    if (el && el.parentElement) el.remove();
    el = null;
  });

  it('Formats a single-sheet payload', async () => {
    el = await fixture();
    el.data = {
      ':type': 'sheet',
      data: [{ key: 'foo', value: 'bar' }],
    };
    await el.updateComplete;
    expect(el._formatted).to.have.length(1);
    expect(el._formatted[0]).to.deep.equal({
      key: 'data',
      data: [{ key: 'foo', value: 'bar' }],
    });
  });

  it('Formats a multi-sheet payload skipping ":" keys', async () => {
    el = await fixture();
    el.data = {
      ':type': 'multi-sheet',
      ':names': ['a', 'b'],
      a: { data: [{ k: '1' }] },
      b: { data: [{ k: '2' }] },
    };
    await el.updateComplete;
    expect(el._formatted.map((f) => f.key)).to.deep.equal(['a', 'b']);
  });

  it('handleClose dispatches close event', async () => {
    el = await fixture();
    let received;
    el.addEventListener('close', (e) => { received = e.detail; });
    el.handleClose();
    expect(received).to.deep.equal({ action: 'close' });
  });

  it('renderValue returns plain text for non-link values', async () => {
    el = await fixture();
    expect(el.renderValue('plain')).to.equal('plain');
  });

  it('renderValue returns multiple links for comma-separated paths', async () => {
    el = await fixture();
    el.details = { repo: 'r', owner: 'o' };
    const result = el.renderValue('/a, /b');
    expect(Array.isArray(result)).to.be.true;
    expect(result).to.have.length(2);
  });

  it('getUrl returns absolute http URLs unchanged', async () => {
    el = await fixture();
    expect(el.getUrl('https://x.com/p')).to.equal('https://x.com/p');
  });

  it('getUrl builds aem.page URLs from relative paths', async () => {
    el = await fixture();
    el.details = { repo: 'repo', owner: 'org' };
    expect(el.getUrl('/some/path')).to.equal('https://main--repo--org.aem.page/some/path');
  });
});

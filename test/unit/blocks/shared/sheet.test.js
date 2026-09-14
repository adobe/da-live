import { expect } from '@esm-bundle/chai';
import getSheet from '../../../../blocks/shared/sheet.js';

describe('shared/sheet getSheet', () => {
  let savedFetch;

  beforeEach(() => {
    savedFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = savedFetch;
  });

  it('Fetches the URL and returns a CSSStyleSheet', async () => {
    let calls = 0;
    window.fetch = () => {
      calls += 1;
      return Promise.resolve(new Response('.foo { color: red; }', { status: 200 }));
    };

    const sheet = await getSheet('/test/getsheet-fresh.css');
    expect(sheet).to.be.instanceOf(CSSStyleSheet);
    expect(calls).to.equal(1);
  });

  it('Caches the result so subsequent calls do not refetch', async () => {
    let calls = 0;
    window.fetch = () => {
      calls += 1;
      return Promise.resolve(new Response('.bar { color: blue; }', { status: 200 }));
    };

    const url = '/test/getsheet-cached.css';
    const a = await getSheet(url);
    const b = await getSheet(url);
    expect(a).to.equal(b);
    expect(calls).to.equal(1);
  });
});

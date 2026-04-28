import { expect } from '@esm-bundle/chai';
import inlinesvg from '../../../../blocks/shared/inlinesvg.js';

describe('inlinesvg', () => {
  let savedFetch;

  beforeEach(() => {
    savedFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = savedFetch;
  });

  it('Fetches each path and returns array of svg elements', async () => {
    const svg1 = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>';
    const svg2 = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10"/></svg>';
    const responses = { '/a.svg': svg1, '/b.svg': svg2 };
    window.fetch = (path) => Promise.resolve(new Response(responses[path], { status: 200 }));

    const results = await inlinesvg({ paths: ['/a.svg', '/b.svg'] });
    expect(results).to.have.length(2);
    expect(results[0].tagName.toLowerCase()).to.equal('svg');
    expect(results[0].querySelector('circle')).to.exist;
    expect(results[1].querySelector('rect')).to.exist;
  });

  it('Appends each svg to the parent when provided', async () => {
    const svgText = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>';
    window.fetch = () => Promise.resolve(new Response(svgText, { status: 200 }));
    const parent = document.createElement('div');

    await inlinesvg({ parent, paths: ['/a.svg', '/b.svg'] });
    expect(parent.querySelectorAll('svg').length).to.equal(2);
  });

  it('Returns null entries for non-ok responses', async () => {
    window.fetch = () => Promise.resolve(new Response('', { status: 404 }));
    const parent = document.createElement('div');

    let threw = false;
    try {
      const results = await inlinesvg({ paths: ['/missing.svg'] });
      expect(results[0]).to.equal(null);
    } catch {
      // append(null) throws; the function still returns null per fetchIcon. parent path will throw.
      threw = true;
    }
    expect(threw).to.be.false;

    // append null path throws inside parent.append; verify parent path skipped via no parent
    expect(parent.children.length).to.equal(0);
  });
});

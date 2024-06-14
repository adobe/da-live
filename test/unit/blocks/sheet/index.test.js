import { expect } from '@esm-bundle/chai';

// This is needed to make a dynamic import work that is indirectly referenced
// from blocks/sheet/index.js
const { setNx } = await import('../../../../scripts/utils.js');
setNx('/bheuaark/', { hostname: 'localhost' });

const sh = await import('../../../../blocks/sheet/index.js');

describe('Sheets', () => {
  it('Test single sheet getData', async () => {
    const json = `
    {
      "total": 3,
      "limit": 3,
      "offset": 0,
      "data": [
        { "Value": "A" },
        { "Value": "B" },
        { "Value": "C" }
      ],
      ":type": "sheet"
    }`;

    const mockFetch = async (url) => {
      if (url === 'http://example.com') {
        return new Response(json, { status: 200 });
      }
      return undefined;
    };

    const savedFetch = window.fetch;
    try {
      window.fetch = mockFetch;

      const sheet = await sh.getData('http://example.com');
      expect(sheet.length).to.equal(1);
      expect(sheet[0].sheetName).to.equal('data');
      expect(sheet[0].data).to.deep.equal([['Value'], ['A'], ['B'], ['C']]);
    } finally {
      window.fetch = savedFetch;
    }
  });

  it('Test multiple sheet getData', async () => {
    const json = `
    {
      "data": {
        "total": 3,
        "offset": 0,
        "limit": 3,
        "data": [
          { "Tag": "red" },
          { "Tag": "blue" },
          { "Tag": "orange" }
        ]
      },
      "md": {
        "total": 1,
        "offset": 0,
        "limit": 1,
        "data": [{ "Title": "Foo" }]
      },
      ":version": 3,
      ":names": [
        "data",
        "md"
      ],
      ":type": "multi-sheet"
    }`;

    const mockFetch = async (url) => {
      if (url === 'http://example.com') {
        return new Response(json, { status: 200 });
      }
      return undefined;
    };

    const savedFetch = window.fetch;
    try {
      window.fetch = mockFetch;

      const sheet = await sh.getData('http://example.com');
      expect(sheet.length).to.equal(2);
      expect(sheet[0].sheetName).to.equal('data');
      expect(sheet[0].data).to.deep.equal([['Tag'], ['red'], ['blue'], ['orange']]);
      expect(sheet[1].sheetName).to.equal('md');
      expect(sheet[1].data).to.deep.equal([['Title'], ['Foo']]);
    } finally {
      window.fetch = savedFetch;
    }
  });
});

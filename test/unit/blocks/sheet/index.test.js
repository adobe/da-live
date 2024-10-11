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

  it('Test private single sheet', async () => {
    const json = `
    {
      "total": 1,
      "limit": 1,
      "offset": 0,
      "data": [
        {
          "single": "1",
          "sheet": "2",
          "here": "3"
        }
      ],
      ":colWidths": [10, 20, 30],
      ":sheetname": "single-sheet",
      ":type": "sheet",
      ":private": {
        "private-sheet": {
          "total": 1,
          "limit": 1,
          "offset": 0,
          "data": [
            {
              "private": "10",
              "sheet": "20",
              "here": "30"
            }
          ],
          ":colWidths": [5, 10, 15]
        }
      }
    }
    `;

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
      expect(sheet[0].sheetName).to.equal('single-sheet');
      expect(sheet[1].sheetName).to.equal('private-sheet');
      expect(sheet[0].data).to.deep.equal([['single', 'sheet', 'here'], ['1', '2', '3']]);
      expect(sheet[1].data).to.deep.equal([['private', 'sheet', 'here'], ['10', '20', '30']]);
      expect(sheet[0].columns).to.deep.equal([{ width: '10' }, { width: '20' }, { width: '30' }]);
      expect(sheet[1].columns).to.deep.equal([{ width: '5' }, { width: '10' }, { width: '15' }]);
    } finally {
      window.fetch = savedFetch;
    }
  });

  it('Test private multi sheet', async () => {
    const json = `
      {
        "sheet1": {
          "total": 1,
          "limit": 1,
          "offset": 0,
          "data": [
            {
              "sheet1": "1",
              "stuff": "2"
            }
          ],
          ":colWidths": [10, 20]
        },
        "sheet2": {
          "total": 1,
          "limit": 1,
          "offset": 0,
          "data": [
            {
              "sheet2": "2",
              "hello": "world"
            }
          ],
          ":colWidths": [30, 40]
        },
        ":names": ["sheet1", "sheet2"],
        ":version": 3,
        ":type": "multi-sheet",
        ":private": {
          "private-mysheet": {
            "total": 1,
            "limit": 1,
            "offset": 0,
            "data": [
              {
                "this": "1",
                "is": "2",
                "private": "3"
              }
            ],
            ":colWidths": [50, 60, 70]
          }
        }
      }

    `;

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
      expect(sheet.length).to.equal(3);
      expect(sheet[0].sheetName).to.equal('sheet1');
      expect(sheet[1].sheetName).to.equal('sheet2');
      expect(sheet[2].sheetName).to.equal('private-mysheet');

      expect(sheet[0].data).to.deep.equal([['sheet1', 'stuff'], ['1', '2']]);
      expect(sheet[1].data).to.deep.equal([['sheet2', 'hello'], ['2', 'world']]);
      expect(sheet[2].data).to.deep.equal([['this', 'is', 'private'], ['1', '2', '3']]);

      expect(sheet[0].columns).to.deep.equal([{ width: '10' }, { width: '20' }]);
      expect(sheet[1].columns).to.deep.equal([{ width: '30' }, { width: '40' }]);
      expect(sheet[2].columns).to.deep.equal([{ width: '50' }, { width: '60' }, { width: '70' }]);
    } finally {
      window.fetch = savedFetch;
    }
  });
});

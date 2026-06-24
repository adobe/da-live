import { expect } from '@esm-bundle/chai';

// This is needed to make a dynamic import work that is indirectly referenced
// from blocks/sheet/index.js
const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const sh = await import('../../../../blocks/sheet/utils/index.js');

function mockJspreadsheetTabs(container, data) {
  // Mirrors real jspreadsheet.tabs: if jexcel_tabs is present it tries to
  // reuse e.children[0] / e.children[1], which are undefined after innerHTML='',
  // causing "Cannot read properties of undefined (reading 'appendChild')".
  if (container.classList.contains('jexcel_tabs')) {
    const first = container.children[0];
    first.appendChild(document.createElement('div')); // throws if first is undefined
  }
  const innerContainers = data.map(() => '<div class="jexcel_container"></div>').join('');
  container.innerHTML = `<div></div><div>${innerContainers}</div>`;
  container.classList.add('jexcel_tabs');
  container.jexcel = data.map((d) => ({ name: d.sheetName, options: {} }));
}

describe('init - double restore', () => {
  let el;
  let daTitle;
  let savedJspreadsheet;

  beforeEach(() => {
    el = document.createElement('div');
    el.className = 'da-sheet';
    document.body.appendChild(el);

    daTitle = document.createElement('da-title');
    daTitle.permissions = [];
    document.body.appendChild(daTitle);

    savedJspreadsheet = window.jspreadsheet;
    window.jspreadsheet = { tabs: mockJspreadsheetTabs };
  });

  afterEach(() => {
    el.remove();
    daTitle.remove();
    window.jspreadsheet = savedJspreadsheet;
    document.querySelectorAll('da-sheet-tabs').forEach((t) => t.remove());
  });

  it('preserves da-sheet class after second init so restore handler can re-query it', async () => {
    const data = [{ sheetName: 'data', minDimensions: [20, 20], data: [['Key'], ['A']], columns: [{ width: '300' }] }];

    await sh.default(el, data);
    await sh.default(el, data);

    expect(el.classList.contains('da-sheet')).to.be.true;
  });

  it('document.querySelector .da-sheet returns non-null after second init', async () => {
    const data = [{ sheetName: 'data', minDimensions: [20, 20], data: [['Key'], ['A']], columns: [{ width: '300' }] }];

    await sh.default(el, data);
    await sh.default(el, data);

    expect(document.querySelector('.da-sheet')).to.not.be.null;
  });

  it('does not crash on third init call (page load + two restores)', async () => {
    const data = [{ sheetName: 'data', minDimensions: [20, 20], data: [['Key'], ['A']], columns: [{ width: '300' }] }];

    // Simulates: page load, then first restore, then second restore
    await sh.default(el, data);
    await sh.default(el, data);

    // The restore handler always queries .da-sheet at restore time
    const daSheet = document.querySelector('.da-sheet');
    expect(daSheet).to.not.be.null;
    await sh.default(daSheet, data);
  });
});

describe('restoreVersion', () => {
  let savedFetch;
  let savedJspreadsheet;
  let savedHash;
  let daSheet;
  let daTitle;
  let panes;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedHash = window.location.hash;
    savedJspreadsheet = window.jspreadsheet;
    window.jspreadsheet = {
      tabs: (container, data) => {
        const inner = data.map(() => '<div class="jexcel_container"></div>').join('');
        container.innerHTML = `<div></div><div>${inner}</div>`;
        container.classList.add('jexcel_tabs');
        container.jexcel = data.map((d) => ({
          name: d.sheetName,
          options: {},
          getData: () => d.data,
          getConfig: () => ({ columns: d.columns || [] }),
        }));
      },
    };

    daSheet = document.createElement('div');
    daSheet.className = 'da-sheet';
    document.body.appendChild(daSheet);

    // da-sheet-tabs's connectedCallback queries document for a da-title to
    // read .permissions from — provide a stub. Since the test file does not
    // import sheet.js (which would register da-title as a lit element),
    // da-title remains HTMLUnknownElement and skips connectedCallback.
    daTitle = document.createElement('da-title');
    daTitle.permissions = ['read', 'write'];
    document.body.appendChild(daTitle);

    panes = document.createElement('da-sheet-panes');
    document.body.appendChild(panes);
  });

  afterEach(() => {
    window.fetch = savedFetch;
    window.jspreadsheet = savedJspreadsheet;
    if (savedHash) window.location.hash = savedHash;
    daSheet.remove();
    daTitle.remove();
    panes.remove();
    document.querySelectorAll('da-sheet-tabs').forEach((t) => t.remove());
  });

  it('POSTs restored version data to /source and returns true', async () => {
    const { restoreVersion } = await import('../../../../blocks/sheet/utils/utils.js');

    const versionData = [{
      sheetName: 'data',
      minDimensions: [20, 20],
      data: [['Key'], ['restored']],
      columns: [{ width: '300' }],
    }];

    window.location.hash = '#/o/r/sheet';

    let saveUrl;
    let saveBody;
    window.fetch = async (url, opts) => {
      const urlStr = String(url);
      if (urlStr.startsWith('https://admin.hlx.page/ping')) {
        return new Response('', { status: 200, headers: new Headers() });
      }
      if (opts?.method === 'POST' && urlStr.includes('/source/')) {
        saveUrl = urlStr;
        saveBody = opts.body;
        return new Response('', { status: 200 });
      }
      return new Response('', { status: 200 });
    };

    const result = await restoreVersion(daTitle, daSheet, versionData);

    expect(result).to.be.true;
    expect(daTitle.sheet).to.exist;
    expect(saveUrl).to.contain('/source/o/r/sheet.json');
    expect(saveBody).to.be.instanceOf(FormData);
    const blob = saveBody.get('data');
    const payload = JSON.parse(await blob.text());
    expect(JSON.stringify(payload)).to.contain('restored');
  });

  it('Updates da-sheet-panes data so preview reflects restored content', async () => {
    const { restoreVersion } = await import('../../../../blocks/sheet/utils/utils.js');

    const versionData = [{
      sheetName: 'data',
      data: [['Key'], ['fromVersion']],
      columns: [{ width: '300' }],
    }];

    window.location.hash = '#/o/r/sheet';
    window.fetch = async () => new Response('', { status: 200 });

    await restoreVersion(daTitle, daSheet, versionData);

    expect(panes.data).to.exist;
    expect(JSON.stringify(panes.data)).to.contain('fromVersion');
  });
});

// getData takes pathDetails; source.get rebuilds the admin.da.live URL the mock serves.
const SOURCE_DETAILS = { org: 'org', site: 'site', path: '/file.json' };

// The new api.js makes two requests: an hlx6 upgrade probe to admin.hlx.page/ping
// and the actual source fetch. The probe must respond without an
// x-api-upgrade-available header so the source URL stays on DA_ADMIN.
function buildMockFetch(json) {
  return async (url) => {
    if (url.startsWith('https://admin.hlx.page/ping')) {
      return new Response('', { status: 200, headers: new Headers() });
    }
    if (url.startsWith('https://admin.da.live/source/')) {
      const headers = new Headers();
      headers.append('x-da-actions', '/=read,write');
      return new Response(json, { status: 200, headers });
    }
    return undefined;
  };
}

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

    const savedFetch = window.fetch;
    try {
      window.fetch = buildMockFetch(json);

      const sheet = await sh.getData(SOURCE_DETAILS);
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

    const savedFetch = window.fetch;
    try {
      window.fetch = buildMockFetch(json);

      const sheet = await sh.getData(SOURCE_DETAILS);
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

    const savedFetch = window.fetch;
    try {
      window.fetch = buildMockFetch(json);

      const sheet = await sh.getData(SOURCE_DETAILS);
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

    const savedFetch = window.fetch;
    try {
      window.fetch = buildMockFetch(json);

      const sheet = await sh.getData(SOURCE_DETAILS);
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

import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';

import { aem2prose, saveToDa } from '../../../../../blocks/edit/utils/helpers.js';

document.body.innerHTML = await readFile({ path: './mocks/body.html' });

describe('aem2prose', () => {
  before('parse everything', () => {
    const docFragments = aem2prose(document);
    const main = document.body.querySelector('main');
    main.innerHTML = '';
    main.append(...docFragments);
  });

  it('Decorates block', () => {
    const threeTwo = document.querySelector('table');
    // Title
    const title = threeTwo.querySelector('td').textContent;
    expect(title).to.equal('marquee (dark, large)');

    // Last cell
    const lastCell = [...threeTwo.querySelectorAll('td')].slice(-1)[0];
    expect(lastCell.colSpan).to.equal(2);
  });

  it('Decorates picture', () => {
    const pic = document.querySelector('picture');
    expect(pic).to.not.exist;
  });

  it('Decorates sections', () => {
    const hr = document.querySelector('hr');
    expect(hr).to.exist;
  });

  it('Decorates HRs', () => {
    const hr = document.querySelector('table hr');
    expect(hr).to.exist;
  });
});

function createSheet(name, data, columnWidths) {
  return {
    name,
    getData: () => data,
    getConfig: () => ({ columns: columnWidths.map((w) => ({ width: `${w}` })) }),
  };
}

describe('saveToDa', () => {
  it('Saves sheets', async () => {
    const mockFetch = async (url, opts) => {
      const payload = [...opts.body.entries()][0][1];
      return new Response(payload, { status: 200 });
    };

    const sheets = [
      createSheet(
        'sheet1',
        [['A', 'B', ''], ['1', '2', ''], ['', '', ''], ['', '', '']],
        [10, 20, 30],
      ),
      createSheet(
        'sheet2',
        [['C', 'D', ''], ['3', '4', ''], ['', '', ''], ['', '', '']],
        [5, 10, 15],
      ),
      createSheet(
        'private-sheet3',
        [['E', 'F', ''], ['5', '6', ''], ['', '', ''], ['', '', '']],
        [11, 12, 13],
      ),
    ];

    const savedFetch = window.fetch;
    try {
      window.fetch = mockFetch;
      const resp = await saveToDa('/aemsites/test/sheet1', sheets);
      const text = await resp.text();
      expect(text).to.equal('{"sheet1":{"total":1,"limit":1,"offset":0,"data":[{"A":"1","B":"2"}],":colWidths":[10,20]},"sheet2":{"total":1,"limit":1,"offset":0,"data":[{"C":"3","D":"4"}],":colWidths":[5,10]},":names":["sheet1","sheet2"],":version":3,":type":"multi-sheet",":private":{"private-sheet3":{"total":1,"limit":1,"offset":0,"data":[{"E":"5","F":"6"}],":colWidths":[11,12]}}}');
    } finally {
      window.fetch = savedFetch;
    }
  });
});

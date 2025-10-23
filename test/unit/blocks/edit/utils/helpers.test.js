import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';

import {
  aem2prose,
  saveToDa,
  convertSheets,
  parse,
  createElement,
  createTooltip,
  createButton,
} from '../../../../../blocks/edit/utils/helpers.js';

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

describe('convertSheets', () => {
  it('Converts single public sheet', () => {
    const sheets = [
      createSheet(
        'sheet1',
        [['A', 'B'], ['1', '2']],
        [10, 20],
      ),
    ];

    const result = convertSheets(sheets);

    expect(result).to.deep.equal({
      total: 1,
      limit: 1,
      offset: 0,
      data: [{ A: '1', B: '2' }],
      ':colWidths': [10, 20],
      ':sheetname': 'sheet1',
      ':type': 'sheet',
    });
  });

  it('Converts multiple public sheets', () => {
    const sheets = [
      createSheet(
        'sheet1',
        [['A', 'B'], ['1', '2']],
        [10, 20],
      ),
      createSheet(
        'sheet2',
        [['C', 'D'], ['3', '4']],
        [30, 40],
      ),
    ];

    const result = convertSheets(sheets);

    expect(result).to.deep.equal({
      sheet1: {
        total: 1,
        limit: 1,
        offset: 0,
        data: [{ A: '1', B: '2' }],
        ':colWidths': [10, 20],
      },
      sheet2: {
        total: 1,
        limit: 1,
        offset: 0,
        data: [{ C: '3', D: '4' }],
        ':colWidths': [30, 40],
      },
      ':names': ['sheet1', 'sheet2'],
      ':version': 3,
      ':type': 'multi-sheet',
    });
  });

  it('Converts sheets with private sheets', () => {
    const sheets = [
      createSheet(
        'sheet1',
        [['A', 'B'], ['1', '2']],
        [10, 20],
      ),
      createSheet(
        'private-sheet2',
        [['C', 'D'], ['3', '4']],
        [30, 40],
      ),
    ];

    const result = convertSheets(sheets);

    expect(result).to.deep.equal({
      total: 1,
      limit: 1,
      offset: 0,
      data: [{ A: '1', B: '2' }],
      ':colWidths': [10, 20],
      ':sheetname': 'sheet1',
      ':type': 'sheet',
      ':private': {
        'private-sheet2': {
          total: 1,
          limit: 1,
          offset: 0,
          data: [{ C: '3', D: '4' }],
          ':colWidths': [30, 40],
        },
      },
    });
  });

  it('Converts only private sheets', () => {
    const sheets = [
      createSheet(
        'private-sheet1',
        [['A', 'B'], ['1', '2']],
        [10, 20],
      ),
    ];

    const result = convertSheets(sheets);

    expect(result).to.deep.equal({
      ':private': {
        'private-sheet1': {
          total: 1,
          limit: 1,
          offset: 0,
          data: [{ A: '1', B: '2' }],
          ':colWidths': [10, 20],
        },
      },
    });
  });

  it('Removes trailing empty rows but keeps one data row', () => {
    const sheets = [
      createSheet(
        'sheet1',
        [['A', 'B'], ['1', '2'], ['', ''], ['', '']],
        [10, 20],
      ),
    ];

    const result = convertSheets(sheets);

    expect(result.data).to.have.length(1);
    expect(result.data[0]).to.deep.equal({ A: '1', B: '2' });
  });

  it('Handles empty data with one empty row', () => {
    const sheets = [
      createSheet(
        'sheet1',
        [['A', 'B'], ['', ''], ['', '']],
        [10, 20],
      ),
    ];

    const result = convertSheets(sheets);

    expect(result.data).to.have.length(1);
    expect(result.data[0]).to.deep.equal({ A: '', B: '' });
  });

  it('Filters column widths for non-empty headers', () => {
    const sheets = [
      createSheet(
        'sheet1',
        [['A', '', 'C'], ['1', '', '3']],
        [10, 20, 30],
      ),
    ];

    const result = convertSheets(sheets);

    expect(result[':colWidths']).to.deep.equal([10, 30]);
  });
});

describe('parse', () => {
  it('Parses HTML string into document', () => {
    const htmlString = '<div><p>Hello World</p></div>';
    const doc = parse(htmlString);

    expect(doc).to.be.instanceOf(Document);
    expect(doc.querySelector('p').textContent).to.equal('Hello World');
  });

  it('Parses empty string', () => {
    const doc = parse('');

    expect(doc).to.be.instanceOf(Document);
    expect(doc.body.innerHTML).to.equal('');
  });

  it('Parses complex HTML with attributes', () => {
    const htmlString = '<div class="test" id="main"><span data-value="123">Content</span></div>';
    const doc = parse(htmlString);

    expect(doc.querySelector('.test')).to.exist;
    expect(doc.querySelector('#main')).to.exist;
    expect(doc.querySelector('[data-value="123"]')).to.exist;
    expect(doc.querySelector('span').textContent).to.equal('Content');
  });
});

describe('createElement', () => {
  it('Creates element with tag only', () => {
    const element = createElement('div');

    expect(element.tagName).to.equal('DIV');
    expect(element.className).to.equal('');
    expect(element.attributes.length).to.equal(0);
  });

  it('Creates element with tag and className', () => {
    const element = createElement('span', 'test-class');

    expect(element.tagName).to.equal('SPAN');
    expect(element.className).to.equal('test-class');
  });

  it('Creates element with tag, className, and attributes', () => {
    const element = createElement('input', 'form-input', {
      type: 'text',
      placeholder: 'Enter text',
      'data-testid': 'test-input',
    });

    expect(element.tagName).to.equal('INPUT');
    expect(element.className).to.equal('form-input');
    expect(element.getAttribute('type')).to.equal('text');
    expect(element.getAttribute('placeholder')).to.equal('Enter text');
    expect(element.getAttribute('data-testid')).to.equal('test-input');
  });

  it('Creates element with empty className and attributes', () => {
    const element = createElement('p', '', {});

    expect(element.tagName).to.equal('P');
    expect(element.className).to.equal('');
    expect(element.attributes.length).to.equal(0);
  });

  it('Creates element with multiple CSS classes', () => {
    const element = createElement('div', 'class1 class2 class3');

    expect(element.className).to.equal('class1 class2 class3');
    expect(element.classList.contains('class1')).to.be.true;
    expect(element.classList.contains('class2')).to.be.true;
    expect(element.classList.contains('class3')).to.be.true;
  });
});

describe('createTooltip', () => {
  it('Creates tooltip with text and className', () => {
    const tooltip = createTooltip('Tooltip text', 'tooltip-class');

    expect(tooltip.tagName).to.equal('SPAN');
    expect(tooltip.textContent).to.equal('Tooltip text');
    expect(tooltip.className).to.equal('tooltip-class');
  });

  it('Creates tooltip with empty text', () => {
    const tooltip = createTooltip('', 'tooltip-class');

    expect(tooltip.tagName).to.equal('SPAN');
    expect(tooltip.textContent).to.equal('');
    expect(tooltip.className).to.equal('tooltip-class');
  });

  it('Creates tooltip with undefined className', () => {
    const tooltip = createTooltip('Test', undefined);

    expect(tooltip.tagName).to.equal('SPAN');
    expect(tooltip.textContent).to.equal('Test');
    expect(tooltip.className).to.equal('');
  });

  it('Creates tooltip with special characters', () => {
    const tooltip = createTooltip('Special chars: <>&"\'', 'tooltip');

    expect(tooltip.textContent).to.equal('Special chars: <>&"\'');
  });
});

describe('createButton', () => {
  it('Creates button with className only', () => {
    const button = createButton('btn-primary');

    expect(button.tagName).to.equal('BUTTON');
    expect(button.className).to.equal('btn-primary');
    expect(button.type).to.equal('button');
  });

  it('Creates button with className and type', () => {
    const button = createButton('btn-submit', 'submit');

    expect(button.tagName).to.equal('BUTTON');
    expect(button.className).to.equal('btn-submit');
    expect(button.type).to.equal('submit');
  });

  it('Creates button with className, type, and attributes', () => {
    const button = createButton('btn-custom', 'button', {
      disabled: 'true',
      'data-action': 'save',
      id: 'save-btn',
    });

    expect(button.tagName).to.equal('BUTTON');
    expect(button.className).to.equal('btn-custom');
    expect(button.type).to.equal('button');
    expect(button.getAttribute('disabled')).to.equal('true');
    expect(button.getAttribute('data-action')).to.equal('save');
    expect(button.getAttribute('id')).to.equal('save-btn');
  });

  it('Creates button with empty className', () => {
    const button = createButton('');

    expect(button.tagName).to.equal('BUTTON');
    expect(button.className).to.equal('');
    expect(button.type).to.equal('button');
  });

  it('Creates button with reset type', () => {
    const button = createButton('btn-reset', 'reset');

    expect(button.type).to.equal('reset');
  });
});

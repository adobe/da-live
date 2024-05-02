import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';

import { aem2prose } from '../../../../../blocks/edit/utils/helpers.js';

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

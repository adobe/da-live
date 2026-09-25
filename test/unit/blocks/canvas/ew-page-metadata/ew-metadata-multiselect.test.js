import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

before(async () => {
  await import('../../../../../blocks/canvas/ew-page-metadata/ew-metadata-multiselect.js');
});

const ITEMS = [
  { title: 'News', value: 'news' },
  { title: 'Blog', value: 'blog' },
  { title: 'Adobe Red', value: 'adobe-red', colorValue: '#FF0000' },
];

async function createMultiselect(value = '') {
  const el = document.createElement('ew-metadata-multiselect');
  el.items = ITEMS;
  el.value = value;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function checkboxFor(el, value) {
  return el.shadowRoot.querySelector(`input[type="checkbox"][value="${value}"]`);
}

describe('ew-metadata-multiselect', () => {
  afterEach(() => {
    document.querySelectorAll('ew-metadata-multiselect').forEach((el) => el.remove());
  });

  it('renders one checkbox per item, checked according to the current value', async () => {
    const el = await createMultiselect('news, adobe-red');
    expect(checkboxFor(el, 'news').checked).to.equal(true);
    expect(checkboxFor(el, 'blog').checked).to.equal(false);
    expect(checkboxFor(el, 'adobe-red').checked).to.equal(true);
  });

  it('renders a color swatch next to items with a colorValue', async () => {
    const el = await createMultiselect();
    const swatch = el.shadowRoot.querySelector('.swatch');
    expect(swatch).to.exist;
    expect(swatch.style.backgroundColor).to.match(/rgb\(255, 0, 0\)|#ff0000/i);
  });

  it('emits change with the comma-joined selected values, in item order', async () => {
    const el = await createMultiselect('news');
    let detail;
    el.addEventListener('change', (e) => { detail = e.detail; });
    checkboxFor(el, 'adobe-red').click();
    expect(detail.value).to.equal('news, adobe-red');
  });

  it('removes a value from the selection on uncheck', async () => {
    const el = await createMultiselect('news, blog');
    let detail;
    el.addEventListener('change', (e) => { detail = e.detail; });
    checkboxFor(el, 'news').click();
    expect(detail.value).to.equal('blog');
  });
});

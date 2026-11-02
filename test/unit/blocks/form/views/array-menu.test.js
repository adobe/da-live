import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import '../../../../../blocks/form/views/array-menu.js';

// _canRemove has no minItems floor — below-min is flagged by validation, not
// blocked (mirrors the SDK). Remove is disabled only when readonly or empty.

const tick = () => new Promise((r) => { setTimeout(r); });
const settle = async (el) => {
  await el.updateComplete;
  await tick();
  await el.updateComplete;
};

const mounted = [];
afterEach(() => { while (mounted.length) mounted.pop().remove(); });

async function mountMenu(props) {
  const el = window.document.createElement('nx-array-menu');
  Object.assign(el, { pointer: '/data/items/0', index: 0, open: true, ...props });
  window.document.body.append(el);
  mounted.push(el);
  await settle(el);
  return el;
}

const removeButton = (el) => [...el.shadowRoot.querySelectorAll('.menu-item')]
  .find((b) => /remov/i.test(b.textContent));

describe('nx-array-menu remove gating', () => {
  it('keeps remove enabled on an optional array below minItems', async () => {
    const el = await mountMenu({ required: false, minItems: 3, itemCount: 1 });
    expect(removeButton(el).disabled).to.equal(false);
  });

  it('keeps remove enabled on a required array at its minItems (flagged, not blocked)', async () => {
    const el = await mountMenu({ required: true, minItems: 3, itemCount: 3 });
    expect(removeButton(el).disabled).to.equal(false);
  });

  it('disables remove only when there are no rows to remove', async () => {
    const el = await mountMenu({ required: true, minItems: 3, itemCount: 0 });
    expect(removeButton(el).disabled).to.equal(true);
  });

  it('never allows remove when readonly', async () => {
    const el = await mountMenu({ required: false, minItems: 0, itemCount: 5, readonly: true });
    expect(removeButton(el).disabled).to.equal(true);
  });
});

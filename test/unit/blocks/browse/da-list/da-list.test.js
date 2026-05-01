/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: DaList } = await import('../../../../../blocks/browse/da-list/da-list.js');

const fileItem = (name = 'doc') => ({ name, ext: 'html', path: `/org/site/${name}.html` });
const folderItem = (name = 'folder') => ({ name, path: `/org/site/${name}` });

async function mountWithSelection(items, opts = {}) {
  const {
    unpublish = false,
    deleteCount = items.length,
    deleteCountLoading = false,
  } = opts;
  const el = new DaList();
  // Pre-seed _listItems so the dialog can render without invoking getList(),
  // which fetches /list/{fullpath} and would hang in a test environment.
  el._listItems = items;
  el._selectedItems = items;
  el._confirm = 'delete';
  el._deleteCount = deleteCount;
  el._deleteCountLoading = deleteCountLoading;
  el._unpublish = unpublish;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

const getDialog = (el) => el.shadowRoot.querySelector('da-dialog');
const getYesInput = (el) => getDialog(el)?.querySelector('sl-input[placeholder="YES"]') || null;
const getHeading = (el) => getDialog(el)?.querySelector('.da-actionbar-modal-confirmation .sl-heading-m')?.textContent ?? null;

function typeInto(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

function getDisabled(el) {
  const dialog = getDialog(el);
  return dialog?.action?.disabled ?? null;
}

describe('DaList delete confirmation', () => {
  afterEach(() => {
    document.querySelectorAll('da-list').forEach((n) => n.remove());
  });

  it('below threshold, no unpublish: no YES input, button enabled', async () => {
    const el = await mountWithSelection([fileItem('a'), fileItem('b')]);
    expect(getYesInput(el)).to.equal(null);
    expect(getDisabled(el)).to.equal(false);
  });

  it('at threshold, no unpublish: YES input gates the button with delete-only heading', async () => {
    const items = Array.from({ length: 10 }, (_, i) => fileItem(`a${i}`));
    const el = await mountWithSelection(items);
    const input = getYesInput(el);
    expect(input).to.not.equal(null);
    expect(getHeading(el)).to.equal('Are you sure you want to delete 10 items?');
    expect(getDisabled(el)).to.equal(true);

    typeInto(input, 'YES');
    await el.updateComplete;
    expect(el._confirmText).to.equal('YES');
    expect(getDisabled(el)).to.equal(false);
  });

  it('at MAX_DELETE_COUNT, no unpublish: YES input still gates the button', async () => {
    const el = await mountWithSelection([fileItem()], { deleteCount: 1000 });
    const input = getYesInput(el);
    expect(input).to.not.equal(null);
    expect(getDisabled(el)).to.equal(true);

    typeInto(input, 'YES');
    await el.updateComplete;
    expect(getDisabled(el)).to.equal(false);
  });

  it('above MAX_DELETE_COUNT: blocked branch, no YES input, button disabled', async () => {
    const el = await mountWithSelection([fileItem()], { deleteCount: 1001 });
    expect(getYesInput(el)).to.equal(null);
    expect(getDisabled(el)).to.equal(true);
  });

  it('combined unpublish + threshold: single YES gate with combined heading', async () => {
    const items = Array.from({ length: 10 }, (_, i) => fileItem(`a${i}`));
    const el = await mountWithSelection(items, { unpublish: true });

    // Only one YES input should exist.
    expect(getDialog(el).querySelectorAll('sl-input[placeholder="YES"]').length).to.equal(1);
    expect(getHeading(el)).to.equal('Are you sure you want to unpublish and delete 10 items?');
    expect(getDisabled(el)).to.equal(true);

    typeInto(getYesInput(el), 'YES');
    await el.updateComplete;
    expect(getDisabled(el)).to.equal(false);
  });

  it('unpublish only (small selection) keeps existing "unpublish?" heading', async () => {
    const el = await mountWithSelection([fileItem()], { unpublish: true });
    expect(getHeading(el)).to.equal('Are you sure you want to unpublish?');
  });

  it('auto-uppercases lowercase typed into the YES input', async () => {
    const el = await mountWithSelection([fileItem()], { unpublish: true });
    const input = getYesInput(el);

    typeInto(input, 'yes');
    await el.updateComplete;

    expect(input.value).to.equal('YES');
    expect(el._confirmText).to.equal('YES');
    expect(getDisabled(el)).to.equal(false);
  });

  it('auto-uppercases for the delete-only big-selection gate too', async () => {
    const items = Array.from({ length: 10 }, (_, i) => fileItem(`a${i}`));
    const el = await mountWithSelection(items);
    const input = getYesInput(el);

    typeInto(input, 'yes');
    await el.updateComplete;

    expect(input.value).to.equal('YES');
    expect(el._confirmText).to.equal('YES');
    expect(getDisabled(el)).to.equal(false);
  });

  it('does not rewrite already-uppercase value (caret-stable guard)', async () => {
    const el = await mountWithSelection([fileItem()], { unpublish: true });
    const input = getYesInput(el);

    let writes = 0;
    let stored = '';
    Object.defineProperty(input, 'value', {
      get: () => stored,
      set: (v) => { stored = v; writes += 1; },
      configurable: true,
    });

    input.value = 'YES'; // initial set: 1
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await el.updateComplete;

    expect(stored).to.equal('YES');
    expect(writes).to.equal(1);
    expect(el._confirmText).to.equal('YES');
  });

  it('YES input has autofocus when shown', async () => {
    const items = Array.from({ length: 10 }, (_, i) => fileItem(`a${i}`));
    const el = await mountWithSelection(items, { unpublish: true });
    expect(getYesInput(el).hasAttribute('autofocus')).to.equal(true);
  });

  it('handleConfirmClose clears the confirmation text', async () => {
    const el = await mountWithSelection([fileItem()], { unpublish: true });
    el._confirmText = 'YES';

    el.handleConfirmClose();

    expect(el._confirmText).to.equal(null);
    expect(el._unpublish).to.equal(null);
    expect(el._confirm).to.equal(null);
    expect(el._deleteCount).to.equal(null);
    expect(el._deleteCountLoading).to.equal(false);
  });

  it('folder-only branch with threshold consolidates the question into a single lead and drops the redundant heading', async () => {
    const el = await mountWithSelection([folderItem('big')], { deleteCount: 50 });
    const dialog = getDialog(el);
    const lead = dialog.querySelector('p');
    expect(lead.textContent.trim()).to.equal('Are you sure you want to delete 50 items? Published items will remain live.');
    expect(getYesInput(el)).to.not.equal(null);
    expect(getHeading(el)).to.equal(null);
    expect(getDisabled(el)).to.equal(true);
  });

  it('folder-only branch below threshold keeps the generic "this content" lead', async () => {
    const el = await mountWithSelection([folderItem('small')], { deleteCount: 3 });
    const lead = getDialog(el).querySelector('p');
    expect(lead.textContent.trim()).to.equal('Are you sure you want to delete this content? Published items will remain live.');
    expect(getYesInput(el)).to.equal(null);
  });

  it('loading state renders an empty body so only the "Crawling…" footer message is visible', async () => {
    const el = await mountWithSelection([folderItem('big')], {
      deleteCount: null,
      deleteCountLoading: true,
    });
    const dialog = getDialog(el);
    // No body text — just the footer message.
    expect(dialog.querySelectorAll('p').length).to.equal(0);
    expect(getYesInput(el)).to.equal(null);
    expect(dialog.message).to.equal('Crawling selected folders…');
    expect(getDisabled(el)).to.equal(true);
  });
});

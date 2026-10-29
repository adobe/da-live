import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import sinon from 'sinon';
import '../../../../../blocks/form/fields/asset.js';
import { CANCELLED } from '../../../../../blocks/form/assets/sources.js';

const mounted = [];

afterEach(() => {
  sinon.restore();
  while (mounted.length) mounted.pop().remove();
});

const source = ({
  id,
  label = id,
  select = async () => CANCELLED,
  fileTypes,
  assetTypes,
}) => ({ id, label, select, fileTypes, assetTypes });

const upload = (overrides = {}) => source({ id: 'upload', label: 'Upload', fileTypes: ['image/png', 'application/pdf'], ...overrides });
const imageUpload = () => upload({ assetTypes: ['image'] });
const aem = (overrides = {}) => source({ id: 'aem-assets', label: 'AEM Assets', ...overrides });

async function mount(options = {}) {
  const field = document.createElement('form-asset');
  Object.assign(field, { label: 'Hero image', showsPreview: true, sources: [upload(), aem()], ...options });
  document.body.append(field);
  mounted.push(field);
  await field.updateComplete;
  return field;
}

const nextTask = () => new Promise((done) => { setTimeout(done, 0); });

const settle = async (field) => {
  await nextTask();
  await field.updateComplete;
};

/**
 * Creates a source `select` that stays pending until the test resolves it.
 * @returns {{ select: () => Promise<object>, resolve: (result: object) => void }}
 */
function deferredSelect() {
  let finish;
  const select = () => new Promise((done) => { finish = done; });
  return { select, resolve: (result) => finish(result) };
}

const query = (field, selector) => field.shadowRoot.querySelector(selector);
// Finds a button by its text, or an icon button by its label.
const button = (field, name) => [...field.shadowRoot.querySelectorAll('button')]
  .find((element) => element.textContent.trim() === name || element.getAttribute('aria-label') === name);
const menu = (field) => query(field, 'nx-menu');
const box = (field) => query(field, '.asset');
const heightOf = (element) => element.getBoundingClientRect().height;
const message = (field) => query(field, '.form-field-error, .form-field-description');

function recordChanges(field) {
  const values = [];
  field.addEventListener('change', (event) => values.push(event.target.value));
  return values;
}

async function pick(field, id) {
  menu(field).dispatchEvent(new CustomEvent('select', { detail: { id } }));
  await field.updateComplete;
}

function answerFilePicker(field, file) {
  const input = query(field, '.file-input');
  sinon.stub(input, 'click').callsFake(() => {
    if (!file) {
      input.dispatchEvent(new Event('cancel'));
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
  });
  return input;
}

describe('form-asset', () => {
  it('shows the label, required marker and an empty row', async () => {
    const field = await mount({ required: true });
    expect(query(field, 'label').textContent).to.include('Hero image');
    expect(query(field, '.form-required')).to.exist;
    expect(query(field, '.asset-placeholder').textContent).to.equal('No asset selected');
    expect(query(field, 'nx-dialog')).to.equal(null);
  });

  it('offers every available source in a menu anchored to the trigger end', async () => {
    const field = await mount();
    expect(menu(field).items).to.deep.equal([
      { id: 'upload', label: 'Upload' },
      { id: 'aem-assets', label: 'AEM Assets' },
    ]);
    expect(menu(field).getAttribute('placement')).to.equal('below-end');
  });

  it('opens a single source directly', async () => {
    const select = sinon.fake.resolves(CANCELLED);
    const field = await mount({ sources: [aem({ select })] });
    expect(menu(field)).to.equal(null);
    button(field, 'Select').click();
    await settle(field);
    expect(select.calledOnce).to.be.true;
  });

  it('waits for sources to load without explaining anything yet', async () => {
    const field = await mount({ sources: undefined });
    expect(button(field, 'Select').disabled).to.be.true;
    expect(message(field)).to.equal(null);
  });

  it('disables Select and explains why when no source is available', async () => {
    const field = await mount({ sources: [] });
    expect(button(field, 'Select').disabled).to.be.true;
    expect(message(field).textContent).to.equal('No source is available for this field.');
  });

  it('keeps an image-only source on image fields', async () => {
    const field = await mount({ assetType: 'image', sources: [imageUpload(), aem()] });
    expect(menu(field).items.map(({ id }) => id)).to.deep.equal(['upload', 'aem-assets']);
  });

  it('hides an image-only source on file fields', async () => {
    const select = sinon.fake.resolves(CANCELLED);
    const field = await mount({ assetType: 'file', sources: [imageUpload(), aem({ select })] });
    expect(menu(field)).to.equal(null);
    button(field, 'Select').click();
    await settle(field);
    expect(select.calledOnce).to.be.true;
  });

  it('tells the source which asset type the field takes', async () => {
    const select = sinon.fake.resolves(CANCELLED);
    const field = await mount({ assetType: 'image', sources: [aem({ select })] });
    button(field, 'Select').click();
    await settle(field);
    expect(select.firstCall.args[0]).to.deep.equal({ assetType: 'image' });
  });

  it('explains that files need AEM Assets when it is not set up', async () => {
    const field = await mount({ assetType: 'file', sources: [imageUpload()] });
    expect(button(field, 'Select').disabled).to.be.true;
    expect(message(field).textContent)
      .to.equal('Files can only be selected from AEM Assets, which is not set up for this site.');
  });

  it('starts as a single row and expands to the preview panel for an image', async () => {
    const field = await mount();
    const emptyBox = heightOf(box(field));
    expect(query(field, '.asset-preview')).to.equal(null);
    expect(box(field).classList.contains('has-preview')).to.be.false;
    expect(emptyBox).to.be.lessThan(100);
    field.value = './media_abc.png';
    await field.updateComplete;
    expect(query(field, '.asset-preview')).to.exist;
    expect(heightOf(box(field))).to.be.greaterThan(200);
  });

  it('collapses to a single row for files that are not images', async () => {
    const field = await mount({ value: 'https://x.test/files/spec.pdf' });
    expect(query(field, '.asset-preview')).to.equal(null);
    expect(box(field).classList.contains('has-preview')).to.be.false;
    expect(heightOf(box(field))).to.be.lessThan(100);
    expect(query(field, '.asset-url').textContent).to.equal('https://x.test/files/spec.pdf');
  });

  it('keeps an image as a single row in a field without previews', async () => {
    const field = await mount({ showsPreview: false, value: './media_abc.png' });
    expect(query(field, '.asset-preview')).to.equal(null);
    expect(box(field).classList.contains('has-preview')).to.be.false;
    expect(query(field, '.asset-url').textContent).to.equal('./media_abc.png');
  });

  it('expands again when a file is replaced with an image, and collapses on the way back', async () => {
    const field = await mount({ value: 'https://x.test/files/spec.pdf' });
    const rowHeight = heightOf(box(field));
    field.value = './media_abc.png';
    await field.updateComplete;
    expect(query(field, '.asset-preview')).to.exist;
    expect(heightOf(box(field))).to.be.greaterThan(rowHeight);
    field.value = 'https://x.test/files/theme.mp3';
    await field.updateComplete;
    expect(query(field, '.asset-preview')).to.equal(null);
    expect(heightOf(box(field))).to.equal(rowHeight);
  });

  it('keeps a video as a single row in a field with previews', async () => {
    const field = await mount({ value: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/site/clip.mp4' });
    expect(query(field, '.asset-preview')).to.equal(null);
    expect(box(field).classList.contains('has-preview')).to.be.false;
  });

  it('shows a generic file label in the panel when the picked image name has no extension', async () => {
    const select = sinon.fake.resolves({ href: 'https://x.test/hero.png', name: 'Hero' });
    const field = await mount({ sources: [aem({ select })] });
    button(field, 'Select').click();
    await settle(field);
    expect(query(field, '.asset-file-type').textContent).to.equal('file');
  });

  it('collapses to the file row when an image preview fails to load', async () => {
    const field = await mount({ value: 'https://x.test/missing.png' });
    const img = query(field, '.asset-preview img');
    await new Promise((resolve) => { img.addEventListener('error', resolve, { once: true }); });
    await field.updateComplete;
    expect(query(field, '.asset-preview')).to.equal(null);
    expect(query(field, '.asset-url').textContent).to.equal('https://x.test/missing.png');
  });

  it('shows the stored URL with Copy, Replace and Remove as icons in the row', async () => {
    const field = await mount({ value: 'https://x.test/files/data%20sheet.pdf' });
    const row = query(field, '.asset-row');
    expect(query(field, '.asset-url').textContent).to.equal('https://x.test/files/data sheet.pdf');
    expect(query(field, '.asset-url').title).to.equal('https://x.test/files/data sheet.pdf');
    expect(menu(field).querySelector('[slot="trigger"]').getAttribute('aria-label')).to.equal('Replace');
    expect(row.contains(menu(field))).to.be.true;
    expect(row.contains(button(field, 'Remove'))).to.be.true;
    expect(row.contains(query(field, '.asset-copy'))).to.be.true;
  });

  it('keeps the actions in the row below an image preview', async () => {
    const field = await mount({ value: './media_abc.png' });
    const row = query(field, '.asset-row');
    expect(query(field, '.asset-preview')).to.exist;
    expect(row.contains(menu(field))).to.be.true;
    expect(row.contains(button(field, 'Remove'))).to.be.true;
    expect(row.contains(query(field, '.asset-copy'))).to.be.true;
  });

  it('offers only a quiet Select button in an empty field', async () => {
    const field = await mount();
    expect(button(field, 'Select').classList.contains('asset-select')).to.be.true;
    expect(button(field, 'Replace')).to.equal(undefined);
    expect(button(field, 'Remove')).to.equal(undefined);
    expect(query(field, '.asset-copy')).to.equal(null);
  });

  it('cuts only the path of a long URL while the whole file name stays readable', async () => {
    const href = `https://content.da.live/${'org/site/players/'.repeat(4)}.sample/racket.jpg`;
    const field = await mount({ value: href });
    const base = query(field, '.asset-url-base');
    const stem = query(field, '.asset-url-stem');
    const tail = query(field, '.asset-url-tail');
    expect(base.scrollWidth).to.be.greaterThan(base.clientWidth);
    expect(stem.textContent).to.equal('racket');
    expect(stem.scrollWidth).to.equal(stem.clientWidth);
    expect(tail.textContent).to.equal('.jpg');
    expect(tail.scrollWidth).to.equal(tail.clientWidth);
  });

  it('cuts a long URL in its path and file name but keeps the extension visible', async () => {
    const longName = `${'very-long-file-name-'.repeat(10)}final.pdf`;
    const href = `https://x.test/${'folder/'.repeat(10)}${longName}`;
    const field = await mount({ value: href });
    const url = query(field, '.asset-url');
    const stem = query(field, '.asset-url-stem');
    const tail = query(field, '.asset-url-tail');
    expect(url.textContent).to.equal(href);
    expect(url.title).to.equal(href);
    expect(query(field, '.asset-url-base').clientWidth).to.be.lessThan(40);
    expect(stem.scrollWidth).to.be.greaterThan(stem.clientWidth);
    expect(tail.textContent).to.equal('.pdf');
    expect(tail.getBoundingClientRect().right).to.be.at.most(url.getBoundingClientRect().right);
    expect(url.getBoundingClientRect().right)
      .to.be.at.most(query(field, '.asset-actions').getBoundingClientRect().left);
  });

  it('shows an AEM video player URL cut in its path, with the player name visible', async () => {
    const player = `https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:${'a1b2'.repeat(9)}/play`;
    const field = await mount({ value: player });
    const url = query(field, '.asset-url');
    const stem = query(field, '.asset-url-stem');
    expect(url.textContent).to.equal(player);
    expect(url.title).to.equal(player);
    expect(stem.textContent).to.equal('play');
    expect(stem.getBoundingClientRect().right).to.be.at.most(url.getBoundingClientRect().right);
  });

  it('previews an image only after it has loaded', async () => {
    const href = `${window.location.origin}/img/favicons/favicon-180.png`;
    const field = await mount({ value: href });
    const img = query(field, '.asset-preview img');
    expect(img.getAttribute('src')).to.equal(href);
    expect(img.classList.contains('is-loaded')).to.be.false;
    await new Promise((resolve) => { img.addEventListener('load', resolve, { once: true }); });
    await field.updateComplete;
    expect(img.classList.contains('is-loaded')).to.be.true;
    const imgBox = img.getBoundingClientRect();
    const previewBox = query(field, '.asset-preview').getBoundingClientRect();
    expect([imgBox.width, imgBox.height]).to.deep.equal([previewBox.width, previewBox.height]);
  });

  it('resolves Media Bus previews against the preview origin once it is known', async () => {
    const field = await mount({ value: './media_a.png' });
    expect(query(field, '.asset-preview img')).to.equal(null);
    field.previewOrigin = 'https://main--site--example.preview.da.live';
    await field.updateComplete;
    expect(query(field, '.asset-preview img').getAttribute('src'))
      .to.equal('https://main--site--example.preview.da.live/media_a.png');
  });

  it('uploads the picked file and announces the new value with a change event', async () => {
    const pdf = new File(['%PDF'], 'spec.pdf', { type: 'application/pdf' });
    const select = sinon.fake.resolves({ href: 'https://x.test/spec.pdf', name: 'spec.pdf' });
    const field = await mount({ sources: [upload({ select })] });
    const input = answerFilePicker(field, pdf);
    const changes = recordChanges(field);

    button(field, 'Select').click();
    await settle(field);

    expect(input.accept).to.equal('image/png,application/pdf');
    expect(select.calledOnceWith(sinon.match({ file: pdf }))).to.be.true;
    expect(changes).to.deep.equal(['https://x.test/spec.pdf']);
    expect(query(field, '.asset-url').textContent).to.equal('https://x.test/spec.pdf');
  });

  it('does nothing when the file picker is cancelled', async () => {
    const select = sinon.fake.resolves(CANCELLED);
    const field = await mount({ sources: [upload({ select })] });
    answerFilePicker(field, undefined);
    const changes = recordChanges(field);
    button(field, 'Select').click();
    await settle(field);
    expect(select.called).to.be.false;
    expect(changes).to.deep.equal([]);
    expect(query(field, '[role="alert"]')).to.equal(null);
  });

  it('commits only a finished result and shows progress meanwhile', async () => {
    const { select: pendingSelect, resolve } = deferredSelect();
    const field = await mount({
      value: './media_old.png',
      sources: [upload(), aem({ select: pendingSelect })],
    });
    const changes = recordChanges(field);
    await pick(field, 'aem-assets');
    expect(field.value).to.equal('./media_old.png');
    expect(query(field, '.asset-source-trigger .nx-loading-spinner[aria-hidden="true"]')).to.exist;
    expect(button(field, 'Replace').disabled).to.be.true;
    expect(button(field, 'Remove').disabled).to.be.true;
    expect(button(field, 'Copy URL').disabled).to.be.false;

    resolve({ href: 'https://x.test/new.pdf', name: 'new.pdf' });
    await settle(field);
    expect(changes).to.deep.equal(['https://x.test/new.pdf']);
    expect(query(field, '.nx-loading-spinner')).to.equal(null);
  });

  it('announces progress from a status outside the buttons and the busy group', async () => {
    const { select: pendingSelect, resolve } = deferredSelect();
    const field = await mount({ sources: [upload(), aem({ select: pendingSelect })] });
    const status = query(field, '[role="status"]');
    expect(status.textContent).to.equal('');
    await pick(field, 'aem-assets');

    expect(field.shadowRoot.querySelectorAll('[role="status"]')).to.have.lengthOf(1);
    expect(query(field, '[role="status"]')).to.equal(status);
    expect(status.textContent).to.equal('Adding asset');
    expect(status.closest('button, [aria-busy]')).to.equal(null);

    resolve(CANCELLED);
    await settle(field);
    expect(status.textContent).to.equal('');
  });

  it('shows progress inside the Select button without moving it', async () => {
    const { select: pendingSelect, resolve } = deferredSelect();
    const field = await mount({ sources: [upload(), aem({ select: pendingSelect })] });
    const select = query(field, '.asset-select');
    const before = select.getBoundingClientRect();
    await pick(field, 'aem-assets');

    const pending = query(field, '.asset-select');
    const after = pending.getBoundingClientRect();
    const spinner = pending.querySelector('.nx-loading-spinner');
    const center = ({ left, top, width, height }) => [left + width / 2, top + height / 2];
    const [spinnerX, spinnerY] = center(spinner.getBoundingClientRect());
    const [buttonX, buttonY] = center(after);
    expect(pending.disabled).to.be.true;
    expect([after.left, after.width, after.height])
      .to.deep.equal([before.left, before.width, before.height]);
    expect(Math.abs(spinnerX - buttonX)).to.be.below(1);
    expect(Math.abs(spinnerY - buttonY)).to.be.below(1);

    resolve(CANCELLED);
    await settle(field);
    expect(query(field, '.nx-loading-spinner')).to.equal(null);
    expect(query(field, '.asset-select').disabled).to.be.false;
  });

  it('keeps the old value when a source cancels, reports an error or throws', async () => {
    const outcomes = [CANCELLED, { error: 'Asset unavailable' }, new Error('Network down')];
    const field = await mount({ value: 'https://x.test/old.png' });
    const changes = recordChanges(field);
    const messages = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const outcome of outcomes) {
      field.sources = [upload(), aem({
        select: async () => {
          if (outcome instanceof Error) {
            throw outcome;
          }
          return outcome;
        },
      })];
      // eslint-disable-next-line no-await-in-loop
      await field.updateComplete;
      // eslint-disable-next-line no-await-in-loop
      await pick(field, 'aem-assets');
      // eslint-disable-next-line no-await-in-loop
      await settle(field);
      messages.push(query(field, '[role="alert"]')?.textContent);
    }
    expect(messages).to.deep.equal([undefined, 'Asset unavailable', 'Network down']);
    expect(changes).to.deep.equal([]);
    expect(field.value).to.equal('https://x.test/old.png');
  });

  it('rejects a result without a usable URL', async () => {
    const field = await mount({ sources: [aem({ select: async () => ({ href: 'data:text/html,hi' }) })] });
    button(field, 'Select').click();
    await settle(field);
    expect(query(field, '[role="alert"]').textContent).to.equal('The selected file did not return a usable URL.');
    expect(field.value).to.equal(undefined);
  });

  it('forgets an in-flight selection and its details when the value changes from outside', async () => {
    const { select: pendingSelect, resolve } = deferredSelect();
    const field = await mount({ sources: [aem({ select: pendingSelect })] });
    const changes = recordChanges(field);
    button(field, 'Select').click();
    await field.updateComplete;

    field.value = 'https://x.test/moved-item.pdf';
    await field.updateComplete;
    resolve({ href: 'https://x.test/late.png', name: 'late.png' });
    await settle(field);

    expect(changes).to.deep.equal([]);
    expect(field.value).to.equal('https://x.test/moved-item.pdf');
    expect(query(field, '.asset-url').textContent).to.equal('https://x.test/moved-item.pdf');
    expect(query(field, '.nx-loading-spinner')).to.equal(null);
  });

  it('asks for confirmation and keeps the value on Cancel', async () => {
    const field = await mount({ value: './media_abc.png' });
    const focus = sinon.spy(query(field, '.asset-remove'), 'focus');
    const changes = recordChanges(field);
    button(field, 'Remove').click();
    await field.updateComplete;
    const dialog = query(field, 'nx-dialog');
    expect(dialog.title).to.equal('Remove asset?');
    expect(dialog.textContent).to.include('The asset will be removed from this field.');

    button(field, 'Cancel').click();
    await field.updateComplete;
    expect(query(field, 'nx-dialog')).to.equal(null);
    expect(changes).to.deep.equal([]);
    expect(focus.calledOnce).to.be.true;
  });

  it('calls every selection an asset when confirming removal', async () => {
    const values = ['https://x.test/spec.pdf', 'https://cdn.example.com/clip.mp4'];
    const titles = await Promise.all(values.map(async (value) => {
      const field = await mount({ value });
      button(field, 'Remove').click();
      await field.updateComplete;
      return query(field, 'nx-dialog').title;
    }));
    expect(titles).to.deep.equal(['Remove asset?', 'Remove asset?']);
  });

  it('removes only the field reference after confirmation', async () => {
    const field = await mount({ value: './media_abc.png' });
    const changes = recordChanges(field);
    button(field, 'Remove').click();
    await field.updateComplete;
    query(field, '.asset-remove-confirm').click();
    await settle(field);
    expect(query(field, 'nx-dialog')).to.equal(null);
    expect(changes).to.deep.equal([undefined]);
    expect(query(field, '.asset-placeholder')).to.exist;
    expect(field.shadowRoot.activeElement).to.equal(button(field, 'Select'));
  });

  describe('alt text', () => {
    const altButton = (field) => button(field, 'Edit alt text');
    const altDialog = (field) => query(field, '.asset-alt-dialog');
    const altDialogInput = (field) => query(field, '#asset-alt-input');

    async function openAltDialog(field) {
      altButton(field).click();
      await field.updateComplete;
      await altDialog(field).updateComplete;
    }

    it('offers an edit alt text button once an asset is set, if the field accepts alt text', async () => {
      const empty = await mount({ acceptsAltText: true });
      const without = await mount({ value: './media_abc.png' });
      const image = await mount({ acceptsAltText: true, value: './media_abc.png', altText: 'A hero' });
      expect(altButton(empty)).to.equal(undefined);
      expect(altButton(without)).to.equal(undefined);
      expect(altButton(image)).to.exist;
      expect(altDialog(image)).to.equal(null);
    });

    it('offers alt text whatever the file looks like', async () => {
      const field = await mount({ acceptsAltText: true, value: 'https://x.test/render?id=1' });
      expect(altButton(field)).to.exist;
    });

    it('says that a required alt text is missing', async () => {
      const field = await mount({ acceptsAltText: true, value: './media_abc.png', altRequired: true, altError: 'This field is required.' });
      expect(query(field, '.form-field-error').textContent)
        .to.equal('Alt text is required.');
      expect(query(field, '.form-field').classList.contains('has-error')).to.equal(true);
      await openAltDialog(field);
      expect(query(field, '.asset-alt-form .form-required')).to.exist;
    });

    it('shows other alt text errors as they are', async () => {
      const field = await mount({ acceptsAltText: true, value: './media_abc.png', altText: 'A hero', altError: 'Too long.' });
      expect(query(field, '.form-field-error').textContent).to.equal('Too long.');
    });

    it('edits the alt text in a dialog and saves it as a change', async () => {
      const field = await mount({ acceptsAltText: true, value: './media_abc.png', altText: 'A hero' });
      const changes = recordChanges(field);
      await openAltDialog(field);
      expect(altDialog(field).title).to.equal('Edit alt text');
      expect(altDialogInput(field).value).to.equal('A hero');
      altDialogInput(field).value = '  A runner at dawn  ';
      query(field, '.asset-alt-save').click();
      await settle(field);
      expect(field.altText).to.equal('A runner at dawn');
      expect(changes).to.deep.equal(['./media_abc.png']);
      expect(altDialog(field)).to.equal(null);
      expect(field.shadowRoot.activeElement).to.equal(altButton(field));
    });

    it('keeps the alt text when the dialog is cancelled', async () => {
      const field = await mount({ acceptsAltText: true, value: './media_abc.png', altText: 'A hero' });
      const changes = recordChanges(field);
      await openAltDialog(field);
      altDialogInput(field).value = 'Something else';
      button(field, 'Cancel').click();
      await settle(field);
      expect(field.altText).to.equal('A hero');
      expect(changes).to.deep.equal([]);
      expect(altDialog(field)).to.equal(null);
    });

    it('clears the alt text when it is saved empty', async () => {
      const field = await mount({ acceptsAltText: true, value: './media_abc.png', altText: 'A hero' });
      await openAltDialog(field);
      altDialogInput(field).value = '   ';
      query(field, '.asset-alt-save').click();
      await settle(field);
      expect(field.altText).to.equal(undefined);
    });

    it('does not edit the alt text of a read-only field', async () => {
      const field = await mount({ acceptsAltText: true, value: './media_abc.png', altText: 'A hero', disabled: true });
      expect(altButton(field).disabled).to.equal(true);
    });

    it('takes the alt text of a selected image from its source', async () => {
      const select = sinon.fake.resolves({ href: './media_new.png', name: 'new.png', alt: 'A runner' });
      const field = await mount({ acceptsAltText: true, sources: [aem({ select })] });
      button(field, 'Select').click();
      await settle(field);
      expect(field.altText).to.equal('A runner');
    });

    it('drops the old alt text when the image is replaced by one without', async () => {
      const select = sinon.fake.resolves({ href: './media_new.png', name: 'new.png' });
      const field = await mount({ acceptsAltText: true, value: './media_old.png', altText: 'The old image', sources: [upload({ select })] });
      answerFilePicker(field, new File(['x'], 'new.png', { type: 'image/png' }));
      button(field, 'Replace').click();
      await settle(field);
      expect(field.value).to.equal('./media_new.png');
      expect(field.altText).to.equal(undefined);
    });

    it('takes no alt text on a field without it, such as a file field', async () => {
      const select = sinon.fake.resolves({ href: './media_new.png', name: 'new.png', alt: 'A runner' });
      const field = await mount({ sources: [aem({ select })] });
      button(field, 'Select').click();
      await settle(field);
      expect(field.altText).to.equal(undefined);
    });

    it('clears the alt text when the asset is removed', async () => {
      const field = await mount({ acceptsAltText: true, value: './media_abc.png', altText: 'A hero' });
      button(field, 'Remove').click();
      await field.updateComplete;
      query(field, '.asset-remove-confirm').click();
      await settle(field);
      expect(field.altText ?? '').to.equal('');
      expect(altButton(field)).to.equal(undefined);
    });
  });

  describe('copying the URL', () => {
    const copyButton = (field) => query(field, '.asset-copy');

    it('offers no copy button without a value', async () => {
      const field = await mount();
      expect(copyButton(field)).to.equal(null);
    });

    it('copies the stored URL and confirms it until the pointer leaves', async () => {
      const writeText = sinon.stub(navigator.clipboard, 'writeText').resolves();
      const field = await mount({ value: 'https://x.test/files/spec.pdf' });

      copyButton(field).click();
      await settle(field);
      expect(writeText.calledOnceWith('https://x.test/files/spec.pdf')).to.be.true;
      expect(copyButton(field).getAttribute('aria-label')).to.equal('URL copied');
      expect(query(field, '.asset-status').textContent).to.equal('URL copied');

      copyButton(field).dispatchEvent(new PointerEvent('pointerleave'));
      await field.updateComplete;
      expect(copyButton(field).getAttribute('aria-label')).to.equal('Copy URL');
      expect(query(field, '.asset-status').textContent).to.equal('');
    });

    it('drops the confirmation when focus leaves the button', async () => {
      sinon.stub(navigator.clipboard, 'writeText').resolves();
      const field = await mount({ value: 'https://x.test/files/spec.pdf' });
      copyButton(field).click();
      await settle(field);
      copyButton(field).dispatchEvent(new FocusEvent('blur'));
      await field.updateComplete;
      expect(copyButton(field).getAttribute('aria-label')).to.equal('Copy URL');
    });

    it('stays unconfirmed when the clipboard is unavailable', async () => {
      sinon.stub(navigator.clipboard, 'writeText').rejects(new Error('denied'));
      const field = await mount({ value: 'https://x.test/files/spec.pdf' });
      copyButton(field).click();
      await settle(field);
      expect(copyButton(field).getAttribute('aria-label')).to.equal('Copy URL');
    });

    it('drops the confirmation when the value changes', async () => {
      sinon.stub(navigator.clipboard, 'writeText').resolves();
      const field = await mount({ value: 'https://x.test/files/spec.pdf' });
      copyButton(field).click();
      await settle(field);
      field.value = 'https://x.test/files/other.pdf';
      await field.updateComplete;
      expect(copyButton(field).getAttribute('aria-label')).to.equal('Copy URL');
    });

    it('stays available in a read-only field', async () => {
      const field = await mount({ value: './media_abc.png', disabled: true });
      expect(copyButton(field).disabled).to.be.false;
    });
  });

  it('disables changes but shows a saved value and validation message when readonly', async () => {
    const field = await mount({ value: './media_abc.png', disabled: true, error: 'Required' });
    expect(menu(field).querySelector('[slot="trigger"]').disabled).to.be.true;
    expect(button(field, 'Remove').disabled).to.be.true;
    expect(query(field, '.form-field-error').textContent).to.equal('Required');
  });

  it('ignores a selection that finishes after the field is disconnected', async () => {
    const { select: pendingSelect, resolve } = deferredSelect();
    const field = await mount({ sources: [aem({ select: pendingSelect })] });
    const changes = recordChanges(field);
    button(field, 'Select').click();
    field.remove();
    resolve({ href: './media_late.png' });
    await nextTask();
    expect(changes).to.deep.equal([]);
  });
});

import { expect } from '@esm-bundle/chai';
import { render, nothing } from 'da-lit';
import {
  renderOrgForm, renderHeader, renderLoadStatus, renderTabs, renderIntro, renderSetup,
  renderParts, renderSaveBar, renderConfirm, renderImportButton, renderImportDialog,
} from '../../../../blocks/config/da-config/views.js';

// Renders into a detached container; assertions use strings and booleans only.
const mount = (template) => {
  const el = document.createElement('div');
  render(template, el);
  return el;
};
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

describe('config views', () => {
  it('asks for an org and submits the form', () => {
    let submitted = false;
    const onSubmit = (e) => {
      e.preventDefault();
      submitted = true;
    };
    const el = mount(renderOrgForm(onSubmit));
    el.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect([!!el.querySelector('input[name="org"]'), submitted]).to.deep.equal([true, true]);
  });

  it('lists the org, a divider and the sites in the scope picker', () => {
    const el = mount(renderHeader({ siteNames: ['a', 'b'], site: 'b', onScopeChange: () => {} }));
    const picker = el.querySelector('nx-picker');
    expect(picker.items.map((i) => i.value ?? 'divider')).to.deep.equal(['', 'divider', 'a', 'b']);
    expect(picker.value).to.equal('b');
  });

  it('shows loading and load failures, and nothing once loaded', () => {
    expect(text(mount(renderLoadStatus({ status: 'loading', scope: 'o/s' })))).to.include('o/s');
    const alert = (status) => {
      const el = mount(renderLoadStatus(status));
      return [...el.querySelectorAll('.config-alert p')].map((p) => p.textContent.trim());
    };
    expect(alert({ status: 'no-access' })).to.deep.equal(['No access', 'You don\'t have access to this configuration.']);
    expect(alert({ status: 'error', httpStatus: 500 })).to.deep.equal(['Could not load configuration', 'The server responded with 500.']);
    expect(renderLoadStatus({ status: 'ok' })).to.equal(nothing);
  });

  describe('renderTabs', () => {
    const one = { id: 'one', label: 'One', sections: [{ id: 'x', label: 'X' }] };
    const two = {
      id: 'two',
      label: 'Two',
      sections: [{ id: 'y', label: 'Y' }, { id: 'z', label: 'Z' }],
    };
    const handlers = { onPrimaryChange: () => {}, onSectionChange: () => {} };

    it('shows the section tabs, without icons, only for a tab with several', () => {
      const selection = { tab: two, section: two.sections[1] };
      const el = mount(renderTabs([one, two], selection, handlers));
      const secondary = el.querySelector('.config-tabs-secondary');
      expect(secondary.value).to.equal('z');
      expect(secondary.items).to.deep.equal([{ value: 'y', label: 'Y' }, { value: 'z', label: 'Z' }]);
      const first = { tab: one, section: one.sections[0] };
      const single = mount(renderTabs([one, two], first, handlers));
      expect(!!single.querySelector('.config-tabs-secondary')).to.equal(false);
    });

    it('reports tab changes', () => {
      const seen = [];
      const el = mount(renderTabs([one, two], { tab: two, section: two.sections[0] }, {
        onPrimaryChange: () => seen.push('primary'),
        onSectionChange: () => seen.push('section'),
      }));
      el.querySelector('.config-tabs-primary').dispatchEvent(new CustomEvent('change'));
      el.querySelector('.config-tabs-secondary').dispatchEvent(new CustomEvent('change'));
      expect(seen).to.deep.equal(['primary', 'section']);
    });
  });

  it('introduces a panel with inheritance, docs, the setup re-run and read-only notes', () => {
    const panel = { description: 'About.', setup: { rerun: { text: 'Stuck?', action: 'Run it' } } };
    const docs = 'https://www.aem.live/docs/x';
    const el = mount(renderIntro(panel, { docs, sheet: '/config#/o/', inheritance: 'Sites inherit.', setupUrl: 'https://app', readOnly: true }));
    const lines = [...el.querySelectorAll('.config-info[role="note"] p')].map((p) => p.textContent.replace(/\s+/g, ' ').trim());
    expect(lines).to.deep.equal([
      'About. Sites inherit.', 'Stuck? Run it', 'You have read-only access to this configuration.',
    ]);
    const links = [...el.querySelectorAll('.config-info-links a')].map((a) => [a.textContent.trim(), a.getAttribute('href')]);
    expect(links).to.deep.equal([['Open sheet', '/config#/o/'], ['Learn more', docs]]);
    const plain = mount(renderIntro(panel, { docs, inheritance: '', setupUrl: null, readOnly: false }));
    expect([text(plain).includes('Stuck?'), text(plain).includes('read-only')]).to.deep.equal([false, false]);
  });

  it('offers the setup app and a re-check', () => {
    let checked = false;
    const el = mount(renderSetup({ text: 'Not set up.', action: 'Set up' }, { setupUrl: 'https://app', onCheck: () => { checked = true; } }));
    expect(el.querySelector('a').getAttribute('href')).to.equal('https://app');
    el.querySelector('button').click();
    expect(checked).to.equal(true);
  });

  it('picks a part', () => {
    const parts = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    const picker = mount(renderParts(parts, parts[1], () => {})).querySelector('nx-picker');
    expect([picker.items.map((i) => i.label), picker.value]).to.deep.equal([['A', 'B'], 'b']);
  });

  describe('renderSaveBar', () => {
    const handlers = (log) => ({ busy: false, onDiscard: () => log.push('discard'), onSave: () => log.push('save') });

    it('shows only with unsaved work', () => {
      expect(renderSaveBar({ dirty: false }, handlers([]))).to.equal(nothing);
    });

    it('discards and saves, and blocks saving invalid or busy work', () => {
      const log = [];
      const el = mount(renderSaveBar({ dirty: true, label: '2 unsaved changes' }, handlers(log)));
      const [discard, saveBtn] = el.querySelectorAll('button');
      discard.click();
      saveBtn.click();
      expect([text(el).startsWith('2 unsaved changes'), log]).to.deep.equal([true, ['discard', 'save']]);
      const invalid = mount(renderSaveBar({ dirty: true, invalid: true }, handlers([])));
      expect(invalid.querySelector('.nx-form-btn-primary').disabled).to.equal(true);
      const busy = mount(renderSaveBar({ dirty: true }, { ...handlers([]), busy: true }));
      expect(text(busy)).to.include('Saving…');
    });
  });

  it('confirms or keeps unsaved changes', () => {
    const answers = [];
    const el = mount(renderConfirm('Prepare', (ok) => answers.push(ok)));
    expect(text(el)).to.include('Your changes to Prepare');
    expect(el.querySelector('[autofocus]').textContent.trim()).to.equal('Keep editing');
    el.querySelectorAll('button').forEach((b) => b.click());
    el.querySelector('nx-dialog').dispatchEvent(new Event('close'));
    expect(answers).to.deep.equal([false, true, false]);
  });

  it('only imports blocks without unsaved changes', () => {
    expect(mount(renderImportButton(true, () => {})).querySelector('button').disabled).to.equal(true);
    let opened = false;
    mount(renderImportButton(false, () => { opened = true; })).querySelector('button').click();
    expect(opened).to.equal(true);
  });

  it('passes the list to the import dialog', () => {
    const dialog = mount(renderImportDialog({
      org: 'o', site: 's', listPath: '/library/blocks.json', existing: ['cards'], onClose: () => {}, onDone: () => {},
    })).querySelector('da-config-blocks-import');
    expect([dialog.org, dialog.site, dialog.listPath, dialog.existing]).to.deep.equal(['o', 's', '/library/blocks.json', ['cards']]);
  });
});

/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

before(async () => {
  await import('../../../../../blocks/canvas/ew-tool-panel/tool-panel.js');
});

// The element is used detached (never appended), so Lit never runs an update
// cycle — we call the changed methods directly. The 'modal' branch of showPanel
// returns before touching the shadow root, so this stays safe without rendering.
function createPanel(views) {
  const el = document.createElement('ew-tool-panel');
  el.views = views;
  return el;
}

describe('EwToolPanel — modal experience', () => {
  describe('_pickerItemsFromViews', () => {
    it('marks a modal view as an external-opening action item', () => {
      const el = createPanel([
        { id: 'blocks', label: 'Blocks', section: 'Library', experience: 'modal' },
      ]);
      const item = el._pickerItemsFromViews().find((i) => i.value === 'blocks');
      expect(item.action).to.be.true;
      expect(item.trailingIcon).to.exist;
      expect(item.ariaLabel).to.equal('Blocks (opens in dialog)');
    });

    it('leaves a plain inline view as a non-action item', () => {
      const el = createPanel([
        { id: 'files', label: 'Files', section: 'Editor', experience: 'inline' },
      ]);
      const item = el._pickerItemsFromViews().find((i) => i.value === 'files');
      expect(item.action).to.be.undefined;
      expect(item.trailingIcon).to.be.undefined;
    });
  });

  describe('showPanel', () => {
    it('invokes openModal and does not activate the view for a modal experience', async () => {
      let opened = 0;
      const openModal = async () => { opened += 1; };
      const el = createPanel([{ id: 'blocks', label: 'Blocks', experience: 'modal', openModal }]);
      await el.showPanel('blocks');
      expect(opened).to.equal(1);
      expect(el.activeId).to.be.undefined;
    });

    it('does not throw when a modal view has no openModal handler', async () => {
      const el = createPanel([{ id: 'blocks', label: 'Blocks', experience: 'modal' }]);
      let threw = false;
      try {
        await el.showPanel('blocks');
      } catch {
        threw = true;
      }
      expect(threw).to.be.false;
      expect(el.activeId).to.be.undefined;
    });
  });
});

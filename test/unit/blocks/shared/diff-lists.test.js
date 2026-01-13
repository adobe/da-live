import { expect } from '@esm-bundle/chai';
import prose2aem from '../../../../blocks/shared/prose2aem.js';

describe('Diff tags in lists - prose2aem', () => {
  describe('loc-deleted-view handling', () => {
    it('should remove list items with loc-deleted-view class', () => {
      const editor = document.createElement('div');
      editor.innerHTML = '<ul><li><div class="loc-deleted-view">Deleted item</div></li><li><p>Normal item</p></li></ul>';

      prose2aem(editor, false);

      const items = editor.querySelectorAll('li');
      expect(items).to.have.lengthOf(1);
      expect(items[0].textContent).to.equal('Normal item');
    });

    it('should remove multiple list items with loc-deleted-view', () => {
      const editor = document.createElement('div');
      editor.innerHTML = '<ul><li><div class="loc-deleted-view">Deleted 1</div></li><li><p>Normal item</p></li><li><div class="loc-deleted-view">Deleted 2</div></li></ul>';

      prose2aem(editor, false);

      const items = editor.querySelectorAll('li');
      expect(items).to.have.lengthOf(1);
      expect(items[0].textContent).to.equal('Normal item');
    });
  });

  describe('loc-added-view handling', () => {
    it('should remove loc-color-overlay and unwrap innerHTML from loc-added-view', () => {
      const editor = document.createElement('div');
      editor.innerHTML = '<ul><li><div class="loc-added-view"><div class="loc-color-overlay"></div>Added item content</div></li><li><p>Normal item</p></li></ul>';

      prose2aem(editor, false);

      const items = editor.querySelectorAll('li');
      expect(items).to.have.lengthOf(2);
      expect(items[0].querySelector('.loc-color-overlay')).to.not.exist;
      expect(items[0].querySelector('.loc-added-view')).to.not.exist;
      expect(items[0].textContent.trim()).to.equal('Added item content');
    });

    it('should handle multiple list items with loc-added-view', () => {
      const editor = document.createElement('div');
      editor.innerHTML = '<ul><li><div class="loc-added-view"><div class="loc-color-overlay"></div>Added 1</div></li><li><p>Normal item</p></li><li><div class="loc-added-view"><div class="loc-color-overlay"></div>Added 2</div></li></ul>';

      prose2aem(editor, false);

      const items = editor.querySelectorAll('li');
      expect(items).to.have.lengthOf(3);
      expect(items[0].querySelector('.loc-color-overlay')).to.not.exist;
      expect(items[0].textContent.trim()).to.equal('Added 1');
      expect(items[1].textContent).to.equal('Normal item');
      expect(items[2].querySelector('.loc-color-overlay')).to.not.exist;
      expect(items[2].textContent.trim()).to.equal('Added 2');
    });
  });

  describe('Combined scenarios', () => {
    it('should handle both loc-deleted-view and loc-added-view in same list', () => {
      const editor = document.createElement('div');
      editor.innerHTML = '<ul><li><div class="loc-deleted-view">Deleted item</div></li><li><div class="loc-added-view"><div class="loc-color-overlay"></div>Added item</div></li><li><p>Normal item</p></li></ul>';

      prose2aem(editor, false);

      const items = editor.querySelectorAll('li');
      expect(items).to.have.lengthOf(2);
      expect(items[0].textContent.trim()).to.equal('Added item');
      expect(items[0].querySelector('.loc-color-overlay')).to.not.exist;
      expect(items[1].textContent).to.equal('Normal item');
    });
  });
});

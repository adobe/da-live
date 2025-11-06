import { expect } from '@esm-bundle/chai';
import { aem2prose } from '../../../../blocks/edit/utils/helpers.js';
import prose2aem from '../../../../blocks/shared/prose2aem.js';

function createDoc(htmlString) {
  return new DOMParser().parseFromString(htmlString, 'text/html');
}

describe('Diff tags in lists - aem2prose', () => {
  describe('da-diff-deleted in lists', () => {
    it('should remove empty li tag inside da-diff-deleted', () => {
      const html = '<body><main><div><ul><da-diff-deleted><li></li></da-diff-deleted><li><p>Normal</p></li></ul></div></main></body>';
      const doc = createDoc(html);
      const fragments = aem2prose(doc);

      const main = document.createElement('main');
      main.append(...fragments);

      const diffDeleted = main.querySelector('da-diff-deleted');
      expect(diffDeleted).to.exist;
      expect(diffDeleted.querySelector('li')).to.not.exist;
    });

    it('should restructure da-diff-deleted > li to li > da-diff-deleted', () => {
      const html = '<body><main><div><ul><da-diff-deleted><li><p>Deleted item</p></li></da-diff-deleted><li><p>Normal</p></li></ul></div></main></body>';
      const doc = createDoc(html);
      const fragments = aem2prose(doc);

      const main = document.createElement('main');
      main.append(...fragments);

      const ul = main.querySelector('ul');
      const firstLi = ul.firstElementChild;

      expect(firstLi.nodeName).to.equal('LI');
      expect(firstLi.firstElementChild.nodeName).to.equal('DA-DIFF-DELETED');
      expect(firstLi.querySelector('da-diff-deleted p').textContent).to.equal('Deleted item');
    });

    it('should handle multiple da-diff-deleted elements in a list', () => {
      const html = '<body><main><div><ol><da-diff-deleted><li><p>Deleted 1</p></li></da-diff-deleted><li><p>Normal item</p></li><da-diff-deleted><li><p>Deleted 2</p></li></da-diff-deleted></ol></div></main></body>';
      const doc = createDoc(html);
      const fragments = aem2prose(doc);

      const main = document.createElement('main');
      main.append(...fragments);

      const ol = main.querySelector('ol');
      const items = ol.querySelectorAll('li');

      expect(items).to.have.lengthOf(3);
      expect(items[0].querySelector('da-diff-deleted')).to.exist;
      expect(items[0].querySelector('da-diff-deleted p').textContent).to.equal('Deleted 1');
      expect(items[1].querySelector('da-diff-deleted')).to.not.exist;
      expect(items[2].querySelector('da-diff-deleted')).to.exist;
      expect(items[2].querySelector('da-diff-deleted p').textContent).to.equal('Deleted 2');
    });

    it('should not restructure da-diff-deleted without li child', () => {
      const html = '<body><main><div><ul><da-diff-deleted><p>Direct paragraph</p></da-diff-deleted><li><p>Normal</p></li></ul></div></main></body>';
      const doc = createDoc(html);
      const fragments = aem2prose(doc);

      const main = document.createElement('main');
      main.append(...fragments);

      const ul = main.querySelector('ul');
      expect(ul.firstElementChild.nodeName).to.equal('DA-DIFF-DELETED');
      expect(ul.firstElementChild.querySelector('p').textContent).to.equal('Direct paragraph');
    });
  });

  describe('da-diff-added in lists', () => {
    it('should restructure da-diff-added > li to li > da-diff-added', () => {
      const html = '<body><main><div><ul><da-diff-added><li><p>Added item</p></li></da-diff-added><li><p>Normal</p></li></ul></div></main></body>';
      const doc = createDoc(html);
      const fragments = aem2prose(doc);

      const main = document.createElement('main');
      main.append(...fragments);

      const ul = main.querySelector('ul');
      const firstLi = ul.firstElementChild;

      expect(firstLi.nodeName).to.equal('LI');
      expect(firstLi.firstElementChild.nodeName).to.equal('DA-DIFF-ADDED');
      expect(firstLi.querySelector('da-diff-added p').textContent).to.equal('Added item');
    });

    it('should handle multiple da-diff-added elements in a list', () => {
      const html = '<body><main><div><ul><da-diff-added><li><p>Added 1</p></li></da-diff-added><li><p>Normal</p></li><da-diff-added><li><p>Added 2</p></li></da-diff-added></ul></div></main></body>';
      const doc = createDoc(html);
      const fragments = aem2prose(doc);

      const main = document.createElement('main');
      main.append(...fragments);

      const ul = main.querySelector('ul');
      const items = ul.querySelectorAll('li');

      expect(items).to.have.lengthOf(3);
      expect(items[0].querySelector('da-diff-added')).to.exist;
      expect(items[0].querySelector('da-diff-added p').textContent).to.equal('Added 1');
      expect(items[1].querySelector('da-diff-added')).to.not.exist;
      expect(items[2].querySelector('da-diff-added')).to.exist;
      expect(items[2].querySelector('da-diff-added p').textContent).to.equal('Added 2');
    });
  });

  describe('Mixed diff elements in lists', () => {
    it('should handle both da-diff-added and da-diff-deleted in same list', () => {
      const html = '<body><main><div><ul><da-diff-deleted><li><p>Deleted</p></li></da-diff-deleted><li><p>Normal</p></li><da-diff-added><li><p>Added</p></li></da-diff-added></ul></div></main></body>';
      const doc = createDoc(html);
      const fragments = aem2prose(doc);

      const main = document.createElement('main');
      main.append(...fragments);

      const ul = main.querySelector('ul');
      const items = ul.querySelectorAll('li');

      expect(items).to.have.lengthOf(3);
      expect(items[0].querySelector('da-diff-deleted')).to.exist;
      expect(items[1].querySelector('da-diff-deleted, da-diff-added')).to.not.exist;
      expect(items[2].querySelector('da-diff-added')).to.exist;
    });
  });
});

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

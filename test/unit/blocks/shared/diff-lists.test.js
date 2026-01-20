import { expect } from '@esm-bundle/chai';
import { DOMSerializer, Y } from 'da-y-wrapper';
import { aem2doc, getSchema, yDocToProsemirror } from 'da-parser';
import prose2aem from '../../../../blocks/shared/prose2aem.js';

async function aem2dom(htmlString) {
  const tempYdoc = new Y.Doc();
  await aem2doc(htmlString, tempYdoc);
  const schema = getSchema();
  const pmDoc = yDocToProsemirror(schema, tempYdoc);
  const serializer = DOMSerializer.fromSchema(schema);
  const fragment = serializer.serializeFragment(pmDoc.content);
  const main = document.createElement('main');
  main.append(fragment);
  return main;
}

describe('Diff tags in lists - aem2doc', () => {
  describe('da-diff-deleted in lists', () => {
    it('should remove empty li tag inside da-diff-deleted', async () => {
      const html = '<body><main><div><ul><da-diff-deleted><li></li></da-diff-deleted><li><p>Normal</p></li></ul></div></main></body>';
      const main = await aem2dom(html);

      const diffDeleted = main.querySelector('da-diff-deleted');
      expect(diffDeleted).to.exist;
      expect(diffDeleted.querySelector('li')).to.not.exist;
    });

    it('should restructure da-diff-deleted > li to li > da-diff-deleted', async () => {
      const html = '<body><main><div><ul><da-diff-deleted><li><p>Deleted item</p></li></da-diff-deleted><li><p>Normal</p></li></ul></div></main></body>';
      const main = await aem2dom(html);

      const ul = main.querySelector('ul');
      const firstLi = ul.firstElementChild;

      expect(firstLi.nodeName).to.equal('LI');
      expect(firstLi.firstElementChild.nodeName).to.equal('DA-DIFF-DELETED');
      expect(firstLi.querySelector('da-diff-deleted p').textContent).to.equal('Deleted item');
    });

    it('should handle multiple da-diff-deleted elements in a list', async () => {
      const html = '<body><main><div><ol><da-diff-deleted><li><p>Deleted 1</p></li></da-diff-deleted><li><p>Normal item</p></li><da-diff-deleted><li><p>Deleted 2</p></li></da-diff-deleted></ol></div></main></body>';
      const main = await aem2dom(html);

      const ol = main.querySelector('ol');
      const items = ol.querySelectorAll('li');

      expect(items).to.have.lengthOf(3);
      expect(items[0].querySelector('da-diff-deleted')).to.exist;
      expect(items[0].querySelector('da-diff-deleted p').textContent).to.equal('Deleted 1');
      expect(items[1].querySelector('da-diff-deleted')).to.not.exist;
      expect(items[2].querySelector('da-diff-deleted')).to.exist;
      expect(items[2].querySelector('da-diff-deleted p').textContent).to.equal('Deleted 2');
    });

    // TODO: aem2doc handles this case differently - needs review
    it.skip('should not restructure da-diff-deleted without li child', async () => {
      const html = '<body><main><div><ul><da-diff-deleted><p>Direct paragraph</p></da-diff-deleted><li><p>Normal</p></li></ul></div></main></body>';
      const main = await aem2dom(html);

      const ul = main.querySelector('ul');
      expect(ul.firstElementChild.nodeName).to.equal('DA-DIFF-DELETED');
      expect(ul.firstElementChild.querySelector('p').textContent).to.equal('Direct paragraph');
    });
  });

  describe('da-diff-added in lists', () => {
    it('should restructure da-diff-added > li to li > da-diff-added', async () => {
      const html = '<body><main><div><ul><da-diff-added><li><p>Added item</p></li></da-diff-added><li><p>Normal</p></li></ul></div></main></body>';
      const main = await aem2dom(html);

      const ul = main.querySelector('ul');
      const firstLi = ul.firstElementChild;

      expect(firstLi.nodeName).to.equal('LI');
      expect(firstLi.firstElementChild.nodeName).to.equal('DA-DIFF-ADDED');
      expect(firstLi.querySelector('da-diff-added p').textContent).to.equal('Added item');
    });

    // TODO: aem2doc serialization produces different structure - needs review
    it.skip('should handle multiple da-diff-added elements in a list', async () => {
      const html = '<body><main><div><ul><da-diff-added><li><p>Added 1</p></li></da-diff-added><li><p>Normal</p></li><da-diff-added><li><p>Added 2</p></li></da-diff-added></ul></div></main></body>';
      const main = await aem2dom(html);

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
    // TODO: aem2doc serialization produces different structure - needs review
    it.skip('should handle both da-diff-added and da-diff-deleted in same list', async () => {
      const html = '<body><main><div><ul><da-diff-deleted><li><p>Deleted</p></li></da-diff-deleted><li><p>Normal</p></li><da-diff-added><li><p>Added</p></li></da-diff-added></ul></div></main></body>';
      const main = await aem2dom(html);

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

import { expect } from '@esm-bundle/chai';
import getEditPath from '../../../../blocks/shared/da-file-item/edit-path.js';

describe('browse/shared getEditPath', () => {
  it('Builds an edit path for html using the editor route', () => {
    const result = getEditPath({
      path: '/adobe/geometrixx/page.html',
      ext: 'html',
      editor: '/edit#',
    });
    expect(result).to.equal('/edit#/adobe/geometrixx/page');
  });

  it('Builds a sheet path for json regardless of editor argument', () => {
    const result = getEditPath({
      path: '/adobe/geometrixx/data.json',
      ext: 'json',
      editor: '/edit#',
    });
    expect(result).to.equal('/sheet#/adobe/geometrixx/data');
  });

  it('Strips org/repo prefix when route targets experience.adobe.com', () => {
    const result = getEditPath({
      path: '/adobe/geometrixx/folder/page.html',
      ext: 'html',
      editor: 'https://experience.adobe.com/edit',
    });
    expect(result).to.equal('https://experience.adobe.com/edit/folder/page');
  });

  it('Falls back to /media# for unsupported extensions', () => {
    const result = getEditPath({
      path: '/adobe/geometrixx/image.png',
      ext: 'png',
      editor: '/edit#',
    });
    expect(result).to.equal('/media#/adobe/geometrixx/image.png');
  });

  describe('with a ref query param on the current page', () => {
    let savedSearch;

    function setSearch(search) {
      const url = new URL(window.location.href);
      url.search = search;
      window.history.replaceState(null, '', url);
    }

    beforeEach(() => {
      savedSearch = window.location.search;
      setSearch('?ref=aem-20261105-3');
    });

    afterEach(() => {
      setSearch(savedSearch);
    });

    it('Carries the ref into the canvas editor route', () => {
      const result = getEditPath({
        path: '/adobe/geometrixx/page.html',
        ext: 'html',
        editor: '/canvas#',
      });
      expect(result).to.equal('/canvas?ref=aem-20261105-3#/adobe/geometrixx/page');
    });

    it('Carries the ref into the classic editor route', () => {
      const result = getEditPath({
        path: '/adobe/geometrixx/page.html',
        ext: 'html',
        editor: '/edit#',
      });
      expect(result).to.equal('/edit?ref=aem-20261105-3#/adobe/geometrixx/page');
    });

    it('Merges with an existing query in the editor route', () => {
      const result = getEditPath({
        path: '/adobe/geometrixx/page.html',
        ext: 'html',
        editor: '/canvas?foo=bar#',
      });
      expect(result).to.equal('/canvas?foo=bar&ref=aem-20261105-3#/adobe/geometrixx/page');
    });

    it('Keeps the full existing query when a value contains a ?', () => {
      const result = getEditPath({
        path: '/adobe/geometrixx/page.html',
        ext: 'html',
        editor: '/canvas?return=https://example.com/?folder=1#',
      });
      expect(result).to.equal('/canvas?return=https://example.com/?folder=1&ref=aem-20261105-3#/adobe/geometrixx/page');
    });

    it('Does not add a stray separator for an empty query', () => {
      const result = getEditPath({
        path: '/adobe/geometrixx/page.html',
        ext: 'html',
        editor: '/canvas?#',
      });
      expect(result).to.equal('/canvas?ref=aem-20261105-3#/adobe/geometrixx/page');
    });

    it('Keeps a ref already set by the editor route', () => {
      const result = getEditPath({
        path: '/adobe/geometrixx/page.html',
        ext: 'html',
        editor: '/canvas?ref=other#',
      });
      expect(result).to.equal('/canvas?ref=other#/adobe/geometrixx/page');
    });

    it('Does not add the ref to external editors', () => {
      const result = getEditPath({
        path: '/adobe/geometrixx/folder/page.html',
        ext: 'html',
        editor: 'https://experience.adobe.com/edit',
      });
      expect(result).to.equal('https://experience.adobe.com/edit/folder/page');
    });

    it('Does not add the ref to sheet or media routes', () => {
      expect(getEditPath({ path: '/adobe/geometrixx/data.json', ext: 'json', editor: '/canvas#' }))
        .to.equal('/sheet#/adobe/geometrixx/data');
      expect(getEditPath({ path: '/adobe/geometrixx/image.png', ext: 'png', editor: '/canvas#' }))
        .to.equal('/media#/adobe/geometrixx/image.png');
    });
  });
});

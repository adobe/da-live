import { expect } from '@esm-bundle/chai';
import getEditPath from '../../../../blocks/browse/shared.js';

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

  it('Keeps every current Browse query parameter on canvas links', () => {
    const result = getEditPath({
      path: '/adobe/geometrixx/page.html',
      ext: 'html',
      editor: '/canvas#',
      search: '?nx=lp&quick-edit=devlive&ew=true&tag=a&tag=b',
    });
    expect(result).to.equal('/canvas?nx=lp&quick-edit=devlive&ew=true&tag=a&tag=b#/adobe/geometrixx/page');
  });

  it('Lets query parameters configured on the canvas route win over Browse ones', () => {
    const result = getEditPath({
      path: '/adobe/geometrixx/page.html',
      ext: 'html',
      editor: '/canvas?nx=main#',
      search: '?nx=lp&theme=light',
    });
    expect(result).to.equal('/canvas?nx=main&theme=light#/adobe/geometrixx/page');
  });

  it('Leaves canvas links unchanged when Browse has no query parameters', () => {
    const result = getEditPath({ path: '/adobe/geometrixx/page.html', ext: 'html', editor: '/canvas#', search: '' });
    expect(result).to.equal('/canvas#/adobe/geometrixx/page');
  });

  it('Does not add Browse query parameters to non-canvas editors', () => {
    const search = '?nx=lp';
    expect(getEditPath({ path: '/adobe/geometrixx/page.html', ext: 'html', editor: '/edit#', search })).to.equal('/edit#/adobe/geometrixx/page');
    expect(getEditPath({ path: '/adobe/geometrixx/page.html', ext: 'html', editor: '/canvasx#', search })).to.equal('/canvasx#/adobe/geometrixx/page');
    expect(getEditPath({ path: '/adobe/geometrixx/data.json', ext: 'json', editor: '/canvas#', search })).to.equal('/sheet#/adobe/geometrixx/data');
    expect(getEditPath({ path: '/adobe/geometrixx/image.png', ext: 'png', editor: '/canvas#', search })).to.equal('/media#/adobe/geometrixx/image.png');
  });

  it('Reads the current page query parameters by default', () => {
    const { href } = window.location;
    try {
      window.history.replaceState(null, '', '?nx=lp&browse=2');
      expect(getEditPath({ path: '/adobe/geometrixx/page.html', ext: 'html', editor: '/canvas#' }))
        .to.equal('/canvas?nx=lp&browse=2#/adobe/geometrixx/page');
    } finally {
      window.history.replaceState(null, '', href);
    }
  });
});

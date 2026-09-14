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
});

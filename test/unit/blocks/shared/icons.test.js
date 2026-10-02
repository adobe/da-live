import { expect } from '@esm-bundle/chai';
import { getTypeLabel, iconPathForExt, ICONS } from '../../../../blocks/shared/icons.js';

describe('browse file types', () => {
  it('labels folders and known file types consistently', () => {
    expect([undefined, 'html', 'json', 'link', 'ico', 'pdf'].map(getTypeLabel))
      .to.deep.equal(['Folder', 'Page', 'Sheet', 'Link', 'Image', 'PDF']);
  });

  it('uses the image icon for ICO files and a file fallback for unknown extensions', () => {
    expect(iconPathForExt('ico')).to.equal(ICONS.png);
    expect(iconPathForExt('unknown')).to.equal(ICONS.file);
  });
});

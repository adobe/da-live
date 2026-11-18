import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import { toolPanelHost } from '../../../../../blocks/form/tool-panel/host.js';

describe('toolPanelHost', () => {
  it('offers the form outline', async () => {
    const [outline] = toolPanelHost.getViews();

    expect(outline.id).to.equal('outline');
    expect((await outline.load()).localName).to.equal('ew-form-outline');
  });
});

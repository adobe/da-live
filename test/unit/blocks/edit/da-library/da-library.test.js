/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

const MOCK_PLUGINS = [
  { name: 'plugin1', class: 'plugin1 is-plugin', url: 'http://localhost:3000/test/plugins/plugin1' },
  { name: 'plugin2', class: 'plugin2 is-plugin', url: 'http://localhost:3000/test/plugins/plugin2' },
];

let daLibrary;

describe('Da Library', () => {
  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'localhost' });
    await import('../../../../../blocks/edit/da-library/da-library.js');
  });

  beforeEach(async () => {
    document.body.innerHTML = '<da-library></da-library>';
    daLibrary = document.querySelector('da-library');
    daLibrary._libraryList = MOCK_PLUGINS;
    daLibrary._activePane = undefined;
    await daLibrary.updateComplete;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('tracks active pane changes', async () => {
    expect(daLibrary._activePane).to.be.undefined;

    const testPluginButton = daLibrary.shadowRoot.querySelector('.plugin1');
    testPluginButton.click();
    await daLibrary.updateComplete;
    expect(daLibrary._activePane).to.equal('plugin1');

    const plugin2Button = daLibrary.shadowRoot.querySelector('.plugin2');
    plugin2Button.click();
    await daLibrary.updateComplete;
    expect(daLibrary._activePane).to.equal('plugin2');
  });

  it('update plugin url when active pane changes', async () => {
    const testPluginButton = daLibrary.shadowRoot.querySelector('.plugin1');
    const testPlugin = daLibrary.shadowRoot.querySelector('[data-library-type="plugin1"] iframe');
    expect(daLibrary._activePane).to.be.undefined;
    expect(testPlugin.src).to.equal('');

    testPluginButton.click();
    await daLibrary.updateComplete;
    expect(daLibrary._activePane).to.equal('plugin1');
    expect(testPlugin.src).to.equal('http://localhost:3000/test/plugins/plugin1');
  });
});

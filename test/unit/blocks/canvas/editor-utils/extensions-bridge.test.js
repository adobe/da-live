import { expect } from '@esm-bundle/chai';

let getExtensionsBridge;
let setExtensionsBridgeContext;
let createExtensionsBridgePlugin;

before(async () => {
  const mod = await import('../../../../../blocks/canvas/editor-utils/extensions-bridge.js');
  ({ getExtensionsBridge, setExtensionsBridgeContext, createExtensionsBridgePlugin } = mod);
});

describe('extensions bridge', () => {
  afterEach(() => {
    setExtensionsBridgeContext();
  });

  it('starts with no permissions or ydoc set', () => {
    setExtensionsBridgeContext();
    const bridge = getExtensionsBridge();
    expect(bridge.permissions).to.be.undefined;
    expect(bridge.ydoc).to.be.undefined;
  });

  it('stores permissions and ydoc for later retrieval', () => {
    const fakeYdoc = { getMap: () => new Map() };
    setExtensionsBridgeContext({ permissions: ['read', 'write'], ydoc: fakeYdoc });
    const bridge = getExtensionsBridge();
    expect(bridge.permissions).to.deep.equal(['read', 'write']);
    expect(bridge.ydoc).to.equal(fakeYdoc);
  });

  it('resets permissions/ydoc to undefined when called with no args', () => {
    setExtensionsBridgeContext({ permissions: ['write'], ydoc: {} });
    setExtensionsBridgeContext();
    const bridge = getExtensionsBridge();
    expect(bridge.permissions).to.be.undefined;
    expect(bridge.ydoc).to.be.undefined;
  });

  it('creating the ProseMirror plugin does not clobber permissions/ydoc', () => {
    setExtensionsBridgeContext({ permissions: ['write'] });
    createExtensionsBridgePlugin();
    expect(getExtensionsBridge().permissions).to.deep.equal(['write']);
  });
});

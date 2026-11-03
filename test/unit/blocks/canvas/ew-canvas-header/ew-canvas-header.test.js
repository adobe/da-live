import { expect } from '@esm-bundle/chai';
import { setNx, getNx, getNxEWFlags } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { setChatAvailability } = await getNxEWFlags();
const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

await import('../../../../../blocks/canvas/ew-canvas-header/ew-canvas-header.js');

function segmentByLabel(header, label) {
  return [...header.shadowRoot.querySelectorAll('.segment')]
    .find((b) => b.textContent.trim().startsWith(label)) ?? null;
}

describe('ew-canvas-header segments', () => {
  let header;

  beforeEach(async () => {
    setChatAvailability(async () => false);
    hashChange._set({});
    header = document.createElement('ew-canvas-header');
    document.body.append(header);
    await header.updateComplete;
  });

  afterEach(() => {
    header.remove();
    setChatAvailability(async () => false);
    hashChange._set({});
  });

  it('renders the Layout, Content and Split segments', async () => {
    header.editorView = 'layout';
    await header.updateComplete;
    expect(header.shadowRoot.querySelectorAll('.segment').length).to.equal(3);
    expect(segmentByLabel(header, 'Layout')).to.exist;
    expect(segmentByLabel(header, 'Content')).to.exist;
  });

  it('never renders a block segment (block editing is a modal now)', async () => {
    for (const view of ['layout', 'content', 'split']) {
      header.editorView = view;
      // eslint-disable-next-line no-await-in-loop
      await header.updateComplete;
      expect(header.shadowRoot.querySelector('.segment-block')).to.be.null;
    }
  });

  it('emits an editor-view request and updates editorView when a segment is clicked', async () => {
    header.editorView = 'layout';
    await header.updateComplete;
    let requestedView;
    const unsub = canvasBus.editorViewRequest.subscribe(({ view }) => { requestedView = view; });

    segmentByLabel(header, 'Content').click();
    unsub?.();

    expect(requestedView).to.equal('content');
    expect(header.editorView).to.equal('content');
  });

  it('uses shared chat availability at org level and site level', async () => {
    const contexts = [];
    setChatAvailability(async (context) => {
      contexts.push(context);
      return context.org === 'allowed' && context.site !== 'disabled';
    });
    hashChange._set({ org: 'allowed' });
    await flush();
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('[data-action="open-panel-before"]')).to.exist;
    const requestCount = contexts.length;
    hashChange._set({ org: 'allowed', path: '/folder' });
    expect(header._chatDisabled).to.be.false;
    await flush();
    expect(contexts).to.have.length(requestCount);
    hashChange._set({ org: 'allowed', site: 'disabled' });
    await flush();
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('[data-action="open-panel-before"]')).to.be.null;
    expect(contexts).to.deep.include.members([
      { org: 'allowed', site: undefined },
      { org: 'allowed', site: 'disabled' },
    ]);
  });

  it('hides chat while checking availability and ignores stale enabled results', async () => {
    let release;
    const delayed = new Promise((resolve) => { release = resolve; });
    setChatAvailability(({ site }) => (site === 'slow' ? delayed : false));
    hashChange._set({ org: 'org', site: 'slow' });
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('[data-action="open-panel-before"]')).to.be.null;
    hashChange._set({ org: 'org', site: 'disabled' });
    await flush();
    release(true);
    await flush();
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('[data-action="open-panel-before"]')).to.be.null;
  });
});

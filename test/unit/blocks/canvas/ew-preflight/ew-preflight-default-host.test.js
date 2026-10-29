/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { getNx, setNx } from '../../../../../scripts/utils.js';

describe('ew-preflight-host built-in default', () => {
  let canvasBus;
  let hashChange;
  let peekPendingPreflightRequest;
  let takePendingPreflightRequest;
  let el;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    const responder = await import('../../../../../blocks/canvas/editor-utils/preflight-responder.js');
    ({ peekPendingPreflightRequest, takePendingPreflightRequest } = responder);
    responder.initPreflightResponder();
    await import('../../../../../blocks/canvas/ew-preflight/ew-preflight-host.js');
    ({ canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js'));
    ({ hashChange } = await import(`${getNx()}/utils/utils.js`));
  });

  async function mount(host = document.createElement('ew-preflight-host')) {
    document.body.append(host);
    await host.updateComplete;
    return host;
  }

  const builtin = (host) => host.shadowRoot.querySelector('ew-preflight');

  afterEach(() => {
    el?.remove();
    el = null;
    takePendingPreflightRequest();
    hashChange._set({});
  });

  it('renders the built-in Preflight and exposes its header actions', async () => {
    el = await mount();
    expect(builtin(el)).to.exist;
    expect(el.getHeaderActions()).to.equal(builtin(el).getHeaderActions());
  });

  it('lets the built-in Preflight claim a publish gate parked before mount', async () => {
    hashChange._set({ org: 'org', site: 'site', path: '/a' });
    el = document.createElement('ew-preflight-host');
    let evaluations = 0;
    el._preflight._evaluate = async () => {
      evaluations += 1;
      el._preflight._data = { failed: 0 };
      return el._preflight._verdictFor({ data: el._preflight._data });
    };
    const events = [];
    const handler = ({ detail }) => events.push(detail);
    document.addEventListener('nx-preflight-status', handler);
    try {
      canvasBus.preflightRunRequest.emit({ paths: ['/org/site/a.html'], requestId: 'h1' });
      expect(peekPendingPreflightRequest()?.requestId).to.equal('h1');
      await mount(el);
      await builtin(el).updateComplete;
      expect(peekPendingPreflightRequest()).to.equal(null);
      expect(evaluations).to.equal(1);
      expect(events).to.deep.equal([
        { path: '/org/site/a.html', status: 'success', requestId: 'h1' },
      ]);
    } finally {
      document.removeEventListener('nx-preflight-status', handler);
    }
  });
});

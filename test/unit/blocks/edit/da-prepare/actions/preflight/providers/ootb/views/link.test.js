/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../../../../../scripts/utils.js';
import PreflightResult, { SEVERITY } from '../../../../../../../../../../blocks/edit/da-prepare/actions/preflight/views/result.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

let savedFetch;

before(async () => {
  savedFetch = window.fetch;
  // Generic 200 for css/svg/sidekick-config/ping lookups; individual tests override
  // window.fetch for the etcFetch(cors) call they care about.
  window.fetch = async () => new Response('', { status: 200 });

  setNx('/test/fixtures/nx', { hostname: 'example.com' });
  await import(
    '../../../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/ootb/views/link.js'
  );
});

after(() => {
  window.fetch = savedFetch;
});

describe('PreflightLink', () => {
  it('registers pf-link as a PreflightResult subclass, starting pending', () => {
    const el = document.createElement('pf-link');
    expect(el).to.be.an.instanceOf(PreflightResult);
    expect(el.status).to.equal('pending');
  });

  it('renders nothing before runCheck() has resolved', async () => {
    const el = document.createElement('pf-link');
    document.body.appendChild(el);
    await nextFrame();

    expect(el.shadowRoot.querySelector('.link-item')).to.equal(null);
    el.remove();
  });

  it('settles an external link based on the etcFetch response', async () => {
    const prevFetch = window.fetch;
    window.fetch = async (url) => {
      if (String(url).includes('/cors?url=')) return new Response('', { status: 200 });
      return prevFetch(url);
    };

    try {
      const el = document.createElement('pf-link');
      Object.assign(el, {
        details: { org: 'org', site: 'site' },
        text: 'Example',
        href: 'https://example.org/some-page',
      });

      await el.runCheck();

      expect(el.status).to.equal('done');
      expect(el.result).to.equal(SEVERITY.SUCCESS);
      expect(el.reason).to.equal('Link published');
    } finally {
      window.fetch = prevFetch;
    }
  });

  it('settles an external link as error when the response is not ok', async () => {
    const prevFetch = window.fetch;
    window.fetch = async (url) => {
      if (String(url).includes('/cors?url=')) return new Response('', { status: 404 });
      return prevFetch(url);
    };

    try {
      const el = document.createElement('pf-link');
      Object.assign(el, {
        details: { org: 'org', site: 'site' },
        text: 'Example',
        href: 'https://example.org/missing',
      });

      await el.runCheck();

      expect(el.result).to.equal(SEVERITY.ERROR);
      expect(el.reason).to.equal('Could not validate link');
    } finally {
      window.fetch = prevFetch;
    }
  });

  it('settles an internal link as error when a site token cannot be obtained', async () => {
    const el = document.createElement('pf-link');
    Object.assign(el, {
      details: { org: 'org', site: 'site' },
      text: 'Home',
      href: '/home',
    });

    await el.runCheck();

    expect(el.status).to.equal('done');
    expect(el.result).to.equal(SEVERITY.ERROR);
    expect(el.reason).to.equal('Could not validate link');
  });

  it('never throws, even if normalizeHref blows up', async () => {
    const el = document.createElement('pf-link');
    Object.assign(el, { details: {}, text: 'Bad', href: 'not a valid url' });

    await el.runCheck();

    expect(el.status).to.equal('done');
    expect(el.result).to.equal(SEVERITY.ERROR);
  });

  it('renders name, path and badge once settled', async () => {
    const prevFetch = window.fetch;
    window.fetch = async (url) => {
      if (String(url).includes('/cors?url=')) return new Response('', { status: 200 });
      return prevFetch(url);
    };

    try {
      const el = document.createElement('pf-link');
      Object.assign(el, {
        details: { org: 'org', site: 'site' },
        text: 'Some Page',
        href: 'https://example.org/some-page',
      });

      await el.runCheck();
      document.body.appendChild(el);
      await nextFrame();

      expect(el.shadowRoot.querySelector('.link-name').textContent).to.equal('Some Page');
      const label = el.shadowRoot.querySelector('pf-label');
      expect(label.badge).to.equal(SEVERITY.SUCCESS);

      el.remove();
    } finally {
      window.fetch = prevFetch;
    }
  });

  it('opens external links with rel="noopener noreferrer"', async () => {
    const prevFetch = window.fetch;
    window.fetch = async (url) => {
      if (String(url).includes('/cors?url=')) return new Response('', { status: 200 });
      return prevFetch(url);
    };

    try {
      const el = document.createElement('pf-link');
      Object.assign(el, {
        details: { org: 'org', site: 'site' },
        text: 'Example',
        href: 'https://example.org/some-page',
      });

      await el.runCheck();
      document.body.appendChild(el);
      await nextFrame();

      const link = el.shadowRoot.querySelector('.link-item-header-title');
      expect(link.getAttribute('rel')).to.equal('noopener noreferrer');

      el.remove();
    } finally {
      window.fetch = prevFetch;
    }
  });
});

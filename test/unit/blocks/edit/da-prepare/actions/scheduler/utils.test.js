import { expect } from '@esm-bundle/chai';
import {
  isRegistered,
  getUserPublishPermission,
  getExistingSchedule,
  schedulePagePublish,
} from '../../../../../../../blocks/edit/da-prepare/actions/scheduler/utils.js';

describe('scheduler/utils', () => {
  let savedFetch;
  let savedLocalStorage;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedLocalStorage = window.localStorage.getItem('nx-ims');
    window.localStorage.removeItem('nx-ims');
  });

  afterEach(() => {
    window.fetch = savedFetch;
    if (savedLocalStorage) window.localStorage.setItem('nx-ims', savedLocalStorage);
  });

  describe('isRegistered', () => {
    it('Returns true on 200', async () => {
      window.fetch = () => Promise.resolve(new Response('', { status: 200 }));
      expect(await isRegistered('org', 'site')).to.be.true;
    });

    it('Returns false on non-200', async () => {
      window.fetch = () => Promise.resolve(new Response('', { status: 404 }));
      expect(await isRegistered('org', 'site')).to.be.false;
    });

    it('Returns false when fetch throws', async () => {
      window.fetch = () => Promise.reject(new Error('boom'));
      expect(await isRegistered('org', 'site')).to.be.false;
    });
  });

  describe('getUserPublishPermission', () => {
    it('Returns true when live.permissions.write is granted', async () => {
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify({ live: { permissions: ['read', 'write'] } }),
        { status: 200 },
      ));
      expect(await getUserPublishPermission('org', 'site', '/page')).to.be.true;
    });

    it('Returns false when live.permissions has no write', async () => {
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify({ live: { permissions: ['read'] } }),
        { status: 200 },
      ));
      expect(await getUserPublishPermission('org', 'site', '/page')).to.be.false;
    });

    it('Returns false when response is not ok', async () => {
      window.fetch = () => Promise.resolve(new Response('', { status: 500 }));
      expect(await getUserPublishPermission('org', 'site', '/page')).to.be.false;
    });

    it('Returns false on network error', async () => {
      window.fetch = () => Promise.reject(new Error('boom'));
      expect(await getUserPublishPermission('org', 'site', '/page')).to.be.false;
    });
  });

  describe('getExistingSchedule', () => {
    it('Returns parsed JSON on success', async () => {
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify({ when: 'tomorrow' }),
        { status: 200 },
      ));
      expect(await getExistingSchedule('o', 's', '/p')).to.deep.equal({ when: 'tomorrow' });
    });

    it('Returns null on failure', async () => {
      window.fetch = () => Promise.resolve(new Response('', { status: 404 }));
      expect(await getExistingSchedule('o', 's', '/p')).to.equal(null);
    });

    it('Returns null on network error', async () => {
      window.fetch = () => Promise.reject(new Error('boom'));
      expect(await getExistingSchedule('o', 's', '/p')).to.equal(null);
    });
  });

  describe('schedulePagePublish', () => {
    it('POSTs json body and returns the response', async () => {
      let captured;
      window.fetch = (url, opts) => {
        captured = { url, opts };
        return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
      };
      const resp = await schedulePagePublish('o', 's', '/p', 'user-1', '2026-01-01');
      expect(captured.opts.method).to.equal('POST');
      expect(captured.opts.headers['content-type']).to.equal('application/json');
      const body = JSON.parse(captured.opts.body);
      expect(body).to.deep.equal({ org: 'o', site: 's', path: '/p', userId: 'user-1', scheduledPublish: '2026-01-01' });
      expect(resp.ok).to.be.true;
    });
  });
});

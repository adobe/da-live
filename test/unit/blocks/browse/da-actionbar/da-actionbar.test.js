/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

describe('DaActionBar', () => {
  let DaActionBar;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    const mod = await import('../../../../../blocks/browse/da-actionbar/da-actionbar.js');
    DaActionBar = mod.default;
  });

  describe('update', () => {
    it('Resets copying/moving/deleting flags when items go empty', async () => {
      const el = new DaActionBar();
      el._isCopying = true;
      el._isMoving = true;
      el._isDeleting = true;
      el.items = [];
      // call internal update directly with property change marker
      const props = new Map([['items', [{ path: '/a/b' }]]]);
      // Stub super.update to avoid LitElement render side effects
      const originalUpdate = Object.getPrototypeOf(Object.getPrototypeOf(el)).update;
      Object.getPrototypeOf(Object.getPrototypeOf(el)).update = () => {};
      try {
        await el.update(props);
      } finally {
        Object.getPrototypeOf(Object.getPrototypeOf(el)).update = originalUpdate;
      }
      expect(el._isCopying).to.be.false;
      expect(el._isMoving).to.be.false;
      expect(el._isDeleting).to.be.false;
    });
  });

  describe('inNewDir', () => {
    it('Returns false when item directory matches currentPath', () => {
      const el = new DaActionBar();
      el.items = [{ path: '/org/repo/folder/page' }];
      el.currentPath = '/org/repo/folder';
      expect(el.inNewDir()).to.be.false;
    });

    it('Returns true when item directory differs from currentPath', () => {
      const el = new DaActionBar();
      el.items = [{ path: '/org/repo/folder/page' }];
      el.currentPath = '/org/repo/other';
      expect(el.inNewDir()).to.be.true;
    });
  });

  describe('_canWrite', () => {
    it('Returns false when no permissions set', () => {
      const el = new DaActionBar();
      expect(el._canWrite).to.be.false;
    });

    it('Returns false when read-only', () => {
      const el = new DaActionBar();
      el.permissions = ['read'];
      expect(el._canWrite).to.be.false;
    });

    it('Returns true when permissions include write', () => {
      const el = new DaActionBar();
      el.permissions = ['read', 'write'];
      expect(el._canWrite).to.be.true;
    });
  });

  describe('_canShare', () => {
    it('Returns false when no items have a non-link extension', () => {
      const el = new DaActionBar();
      el.items = [{ ext: 'link' }, {}];
      expect(el._canShare).to.be.false;
    });

    it('Returns true for files (with ext) when not copying', () => {
      const el = new DaActionBar();
      el.items = [{ ext: 'html' }];
      expect(el._canShare).to.be.true;
    });

    it('Returns false while copying', () => {
      const el = new DaActionBar();
      el.items = [{ ext: 'html' }];
      el._isCopying = true;
      expect(el._canShare).to.be.false;
    });
  });

  describe('handleCopy / handleMove', () => {
    it('handleCopy sets _isCopying only', () => {
      const el = new DaActionBar();
      el.handleCopy();
      expect(el._isCopying).to.be.true;
      expect(el._isMoving).to.equal(undefined);
    });

    it('handleMove sets both _isCopying and _isMoving', () => {
      const el = new DaActionBar();
      el.handleMove();
      expect(el._isCopying).to.be.true;
      expect(el._isMoving).to.be.true;
    });
  });

  describe('handleClear', () => {
    it('Resets state and dispatches clearselection', () => {
      const el = new DaActionBar();
      let dispatched;
      el.dispatchEvent = (event) => { dispatched = event; };
      el._isCopying = true;
      el._isMoving = true;
      el._isDeleting = true;
      el.handleClear();
      expect(el._isCopying).to.be.false;
      expect(el._isMoving).to.be.false;
      expect(el._isDeleting).to.be.false;
      expect(dispatched.type).to.equal('clearselection');
    });
  });

  describe('handlePaste', () => {
    it('Falls back to handleClear when moving and not in a new dir', () => {
      const el = new DaActionBar();
      el._isMoving = true;
      el.items = [{ path: '/a/b/page' }];
      el.currentPath = '/a/b';
      let cleared = false;
      el.dispatchEvent = (e) => { if (e.type === 'clearselection') cleared = true; };
      el.handlePaste();
      expect(cleared).to.be.true;
    });

    it('Dispatches onpaste with move detail when moving across dirs', () => {
      const el = new DaActionBar();
      el._isMoving = true;
      el.items = [{ path: '/a/b/page' }];
      el.currentPath = '/a/c';
      let event;
      el.dispatchEvent = (e) => { event = e; };
      el.handlePaste();
      expect(event.type).to.equal('onpaste');
      expect(event.detail).to.deep.equal({ move: true });
    });

    it('Dispatches onpaste with move=false when only copying', () => {
      const el = new DaActionBar();
      el._isMoving = false;
      el.items = [{ path: '/a/b/page' }];
      el.currentPath = '/a/c';
      let event;
      el.dispatchEvent = (e) => { event = e; };
      el.handlePaste();
      expect(event.detail).to.deep.equal({ move: false });
    });
  });

  describe('currentAction', () => {
    it('Pluralizes for multiple items', () => {
      const el = new DaActionBar();
      el.items = [{ path: '/a' }, { path: '/b' }];
      expect(el.currentAction).to.equal('2 items selected');
    });

    it('Switches to paste-into message when copying with write permission', () => {
      const el = new DaActionBar();
      el.items = [{ path: '/a' }];
      el._isCopying = true;
      el.permissions = ['write'];
      el.currentPath = '/org/repo/folder';
      expect(el.currentAction).to.equal('Paste 1 item into folder');
    });
  });

  describe('handleRename', () => {
    it('Dispatches a rename event', () => {
      const el = new DaActionBar();
      let dispatched;
      el.dispatchEvent = (e) => { dispatched = e; };
      el.handleRename();
      expect(dispatched.type).to.equal('rename');
      expect(dispatched.bubbles).to.be.true;
      expect(dispatched.composed).to.be.true;
    });
  });

  describe('handleDelete', () => {
    it('Dispatches an ondelete event', () => {
      const el = new DaActionBar();
      let dispatched;
      el.dispatchEvent = (e) => { dispatched = e; };
      el.handleDelete();
      expect(dispatched.type).to.equal('ondelete');
    });
  });

  describe('handleShare', () => {
    it('Imports the helper module, runs items2Clipboard, and dispatches onshare', async () => {
      const el = new DaActionBar();
      el.items = [{ ext: 'html', path: '/org/repo/page.html' }];

      const events = [];
      el.dispatchEvent = (e) => { events.push(e); };

      const RealClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { write: () => Promise.resolve() },
      });
      try {
        await el.handleShare();
      } finally {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: RealClipboard });
      }
      expect(events.find((e) => e.type === 'onshare')).to.exist;
    });
  });
});

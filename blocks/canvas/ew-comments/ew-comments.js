import { LitElement, html, nothing, createRef } from 'da-lit';
import getSheet from '../../shared/sheet.js';
import { buildDeepLinkUrl, parseDeepLink } from './helpers/deep-link.js';
import { openCommentsPanel, showCommentsToast, VARIANT_ERROR } from '../editor-utils/comments-bridge.js';
import {
  DRAFT_MODES,
  makeNewDraft,
  makeReplyDraft,
  setDraftText,
  shouldAdoptPendingAnchor,
} from './helpers/draft-state.js';
import {
  renderListView,
  renderThreadView,
  renderConfirmDeleteDialog,
} from './helpers/templates.js';

const sheet = await getSheet('/blocks/canvas/ew-comments/ew-comments.css');

export default class EwComments extends LitElement {
  static properties = {
    controller: { attribute: false },
    // When true (Experience Workspace), the host panel owns the close affordance,
    // so the in-panel title/close row is suppressed.
    embedded: { type: Boolean },
    currentUser: { state: true },
    _activeTab: { state: true },
    _draft: { state: true },
    _submitting: { state: true },
    _submittingId: { state: true },
    _openMenuId: { state: true },
    _pendingDelete: { state: true },
    _threadGroups: { state: true },
  };

  _popoverHostRef = createRef();

  // Read by templates.renderAvatar to avoid recomputing colors per author.
  _avatarColorCache = new Map();

  constructor() {
    super();
    this._activeTab = 'active';
  }

  get activeThreadCount() {
    return this.controller?.counts?.active ?? 0;
  }

  willUpdate(changedProps) {
    if (changedProps.has('controller')) {
      if (this.controller) this.recomputeThreadGroups();
      else this._threadGroups = null;
    }
    this.syncDraftFromPendingAnchor();
  }

  // Recomputing thread groups iterates the entire store and decodes every
  // active anchor — skip it when the panel is closed, since the result isn't
  // visible. The panelOpen subscriber re-runs this when the panel reopens.
  recomputeThreadGroups() {
    if (!this.controller || !this.controller.panelOpen) {
      this._threadGroups = null;
      return;
    }
    this._threadGroups = this.controller.getThreadGroups(
      this.controller.getAttachedThreadIds() ?? null,
    );
  }

  syncDraftFromPendingAnchor() {
    if (!this.controller) return;
    const pending = this.controller.pendingAnchor;
    if (!shouldAdoptPendingAnchor(this._draft, pending)) return;
    this._draft = makeNewDraft(pending);
    this._activeTab = 'active';
  }

  setupObservers() {
    this.teardownObservers();
    if (!this.controller) return;

    this._unsubController = this.controller.subscribe(({ reason }) => {
      if (reason === 'counts' || reason === 'docChange' || reason === 'init'
        || reason === 'panelOpen') {
        this.recomputeThreadGroups();
      }
      if (reason === 'pendingAnchor' || reason === 'panelOpen') {
        this.syncDraftFromPendingAnchor();
        if (this._draft?.mode === DRAFT_MODES.NEW) this.focusDraftTextarea();
      }
      if (reason === 'panelOpen' && !this.controller.panelOpen) {
        this._draft = null;
      }
      this.requestUpdate();
    });

    this.currentUser = this.controller.getCurrentUser();
    this._unsubCurrentUser = this.controller.onCurrentUserChange(() => {
      this.currentUser = this.controller.getCurrentUser();
    });
  }

  teardownObservers() {
    this._unsubController?.();
    this._unsubController = null;
    this._unsubCurrentUser?.();
    this._unsubCurrentUser = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.setupObservers();
    import('../../shared/da-dialog/da-dialog.js');
    this.checkUrlForComment();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.teardownObservers();
    document.removeEventListener('pointerdown', this.handleOutsideClick);
  }

  handleOutsideClick = (event) => {
    const path = event.composedPath();
    const host = this._popoverHostRef.value;
    if (host && path.includes(host)) return;
    if (path.some((el) => el?.localName === 'da-dialog')) return;
    this._openMenuId = null;
  };

  handleClose() {
    if (this._draft) this.cancelDraft();
    this.controller?.closePanel();
    this.dispatchEvent(new CustomEvent('nx-panel-close', { bubbles: true, composed: true }));
  }

  updated(changedProps) {
    if (changedProps.has('controller')) {
      this.setupObservers();
    }
    if (changedProps.has('_openMenuId')) {
      const anyOpen = this._openMenuId;
      if (anyOpen) document.addEventListener('pointerdown', this.handleOutsideClick);
      else document.removeEventListener('pointerdown', this.handleOutsideClick);
    }
    if (changedProps.has('_draft') && this._draft) this.focusDraftTextarea();
    this.resolvePendingCommentLink();
  }

  async focusDraftTextarea() {
    await this.updateComplete;
    const textarea = this.shadowRoot?.querySelector('.ew-comment-form sl-textarea');
    if (!textarea) return;
    await textarea.updateComplete;
    const inner = textarea.shadowRoot?.querySelector('textarea');
    (inner ?? textarea).focus();
  }

  checkUrlForComment() {
    const { commentId, cleaned } = parseDeepLink(new URL(window.location.href));
    if (!commentId) return;
    openCommentsPanel();
    this._pendingCommentLinkId = commentId;
    this.resolvePendingCommentLink();
    window.history.replaceState({}, '', cleaned.toString());
  }

  resolvePendingCommentLink() {
    if (!this._pendingCommentLinkId || !this.controller) return;
    const threadId = this.controller.findThreadForComment(this._pendingCommentLinkId);
    if (!threadId) return;
    this._pendingCommentLinkId = null;
    this.controller.setSelectedThread(threadId);

    requestAnimationFrame(() => {
      this.controller?.scrollToThread(threadId, { behavior: 'smooth' });
    });
  }

  getThreadById(threadId) {
    if (!threadId || !this._threadGroups) return null;
    const { active, detached, resolved } = this._threadGroups;
    return [...active, ...detached, ...resolved].find((t) => t.id === threadId) ?? null;
  }

  selectThread(threadId) {
    this.controller?.setSelectedThread(threadId);
    this.controller?.scrollToThread(threadId);
    this.cancelDraft();
  }

  backToList() {
    this.controller?.setSelectedThread(null);
    this.cancelDraft();
  }

  startReplyDraft(rootComment) {
    this._draft = makeReplyDraft(rootComment.id);
  }

  cancelDraft() {
    this._draft = null;
    this._openMenuId = null;
    this.controller?.clearPendingAnchor();
  }

  updateDraftText(event) {
    this._draft = setDraftText(this._draft, event.target.value);
  }

  handleDraftKeydown(event) {
    if (event.key === 'Escape') this.cancelDraft();
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.submitDraft(event);
    }
  }

  showErrorToast(description) {
    showCommentsToast({ text: 'Error', description, variant: VARIANT_ERROR });
  }

  async submitDraft(event) {
    event.preventDefault();
    const body = this._draft?.text?.trim();
    if (!body || !this.currentUser || this._submitting) return;

    const user = this.currentUser;
    const draft = this._draft;
    this._submitting = true;
    try {
      if (draft.mode === DRAFT_MODES.NEW) {
        const id = await this.controller.createRootComment(
          { user, anchor: draft.anchorData, body },
        );
        this.controller.setSelectedThread(id);
      } else if (draft.mode === DRAFT_MODES.REPLY) {
        await this.controller.createReply({ user, threadId: draft.threadId, body });
      }
      this.controller.collapseSelection();
      this.controller.clearPendingAnchor();
      (this.shadowRoot?.activeElement ?? document.activeElement)?.blur();
      this._draft = null;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[comments] submit failed', err);
      this.showErrorToast('Could not save comment. Please try again.');
    } finally {
      this._submitting = false;
    }
  }

  async deleteComment(commentId) {
    if (this._submittingId) return;
    this._submittingId = commentId;
    try {
      await this.controller.deleteComment({ commentId });
      if (this.controller.selectedThreadId === commentId) {
        this.controller.setSelectedThread(null);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[comments] delete failed', err);
      this.showErrorToast('Could not delete comment. Please try again.');
    } finally {
      this._submittingId = null;
    }
  }

  async handleResolveThread(threadId) {
    if (this._submittingId) return;
    this.cancelDraft();
    this._submittingId = threadId;
    try {
      await this.controller.resolveThread({ threadId, user: this.currentUser });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[comments] resolve failed', err);
      this.showErrorToast('Could not resolve thread. Please try again.');
    } finally {
      this._submittingId = null;
    }
  }

  async handleUnresolveThread(threadId) {
    if (this._submittingId) return;
    this._activeTab = 'active';
    this._submittingId = threadId;
    try {
      await this.controller.unresolveThread({ threadId, user: this.currentUser });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[comments] reopen failed', err);
      this.showErrorToast('Could not reopen thread. Please try again.');
    } finally {
      this._submittingId = null;
    }
  }

  handleDeleteComment(commentId, threadId = this.controller?.selectedThreadId) {
    this._openMenuId = null;
    const thread = this.getThreadById(threadId);
    if (!thread) return;

    if (thread.id === commentId && thread.replies.length > 0) {
      this._pendingDelete = { commentId };
      return;
    }
    this.deleteComment(commentId);
  }

  handleConfirmDeleteComment() {
    if (!this._pendingDelete) return;
    this.deleteComment(this._pendingDelete.commentId);
    this._pendingDelete = null;
  }

  handleDeleteThread(threadId) {
    this.deleteComment(threadId);
    this.cancelDraft();
    this._activeTab = 'active';
  }

  toggleMenu(commentId, event) {
    if (event) event.stopPropagation();
    this._openMenuId = this._openMenuId === commentId ? null : commentId;
  }

  canEditComment(comment) {
    if (!comment || !this.currentUser) return false;
    return this.currentUser.id === comment.author?.id;
  }

  copyThreadLink(threadId = this.controller?.selectedThreadId) {
    if (!threadId) return;
    const url = buildDeepLinkUrl(new URL(window.location.href), threadId);
    this._openMenuId = null;
    navigator.clipboard.writeText(url.toString())
      .then(() => {
        showCommentsToast({ text: 'The link was copied to the clipboard.' });
      })
      .catch(() => {
        showCommentsToast({
          text: 'Error',
          description: 'Could not copy link to clipboard.',
          variant: VARIANT_ERROR,
        });
      });
  }

  render() {
    const { active, detached, resolved } = this._threadGroups
      ?? { active: [], detached: [], resolved: [] };
    const activeThreads = [...active, ...detached];
    const visibleThreads = this._activeTab === 'resolved' ? resolved : activeThreads;
    const tabCounts = { active: activeThreads.length, resolved: resolved.length };

    const selectedThread = this.getThreadById(this.controller?.selectedThreadId);
    const isComposing = this._draft?.mode === DRAFT_MODES.NEW && this.currentUser;
    const isLoading = Boolean(this.controller) && !this.controller.loaded
      && !selectedThread && !isComposing;

    let content;
    if (isLoading) {
      content = html`<div class="ew-comments-loading" role="status" aria-label="Loading comments">
        <span class="ew-comments-spinner"></span>
      </div>`;
    } else if (selectedThread) {
      content = renderThreadView(this, selectedThread);
    } else {
      content = renderListView(this, { visibleThreads, tabCounts });
    }

    return html`
      <div class="ew-comments-panel">
        ${this.embedded ? nothing : html`
          <p class="ew-comments-title">
            <button
              class="ew-comments-close-btn"
              @click=${this.handleClose}
              aria-label="Comments (${this.activeThreadCount}) — close pane">Comments (${this.activeThreadCount})</button>
          </p>
        `}
        <div class="ew-comments-scroll">${content}</div>
      </div>
      ${renderConfirmDeleteDialog(this)}
    `;
  }
}

customElements.define('ew-comments', EwComments);

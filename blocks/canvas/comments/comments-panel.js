import { LitElement, html } from 'da-lit';
import { getNx, getNx2 } from '../../../scripts/utils.js';
import getSheet from '../../shared/sheet.js';
import { openCommentsPanel, getCommentsBridge } from '../editor-utils/comments-bridge.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { buildDeepLinkUrl, parseDeepLink } from './helpers/deep-link.js';
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

await import(`${getNx()}/blocks/shared/menu/menu.js`);
const sheet = await getSheet('/blocks/canvas/comments/comments-panel.css');
const buttons = await getSheet(`${getNx2()}/styles/buttons.css`);
const form = await getSheet(`${getNx2()}/styles/form.css`);

let toastModulePromise;

function loadToastModule() {
  toastModulePromise ??= import(`${getNx2()}/blocks/shared/toast/toast.js`);
  return toastModulePromise;
}

function formatToastMessage(text, description) {
  const title = text?.trim();
  if (!title) return '';
  const body = description?.trim();
  return body ? `${title}\n${body}` : title;
}

export class CommentsPanel extends LitElement {
  static properties = {
    controller: { attribute: false },
    currentUser: { state: true },
    _activeTab: { state: true },
    _draft: { state: true },
    _submitting: { state: true },
    _submittingId: { state: true },
    _pendingDelete: { state: true },
    _threadGroups: { state: true },
  };

  constructor() {
    super();
    this._activeTab = 'active';
  }

  willUpdate(changedProps) {
    if (changedProps.has('controller')) {
      if (this.controller) this.recomputeThreadGroups();
      else this._threadGroups = null;
    }
    this.syncDraftFromPendingAnchor();
  }

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

  setupBusSubscriptions() {
    this.teardownBusSubscriptions();
    this._unsubControllerState = canvasBus.commentsControllerState
      .subscribe((controller) => { this.controller = controller; });
    this._unsubToolView = canvasBus.toolPanelViewState.subscribe((view) => {
      this._activeToolView = view;
      this.syncPanelOpen();
    });
    this.syncPanelOpen();
  }

  syncPanelOpen() {
    this.controller?.setPanelOpen(this._activeToolView === 'comments');
  }

  teardownBusSubscriptions() {
    this._unsubControllerState?.();
    this._unsubControllerState = null;
    this._unsubToolView?.();
    this._unsubToolView = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [
      ...this.shadowRoot.adoptedStyleSheets, buttons, form, sheet,
    ];
    if (this.controller === undefined) this.controller = getCommentsBridge().controller;
    this.setupObservers();
    this.setupBusSubscriptions();
    import('../../shared/da-dialog/da-dialog.js');
    this.checkUrlForComment();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.teardownObservers();
    this.teardownBusSubscriptions();
  }

  openCommentsHost() {
    openCommentsPanel();
  }

  showToast({ text, description, variant } = {}) {
    const message = formatToastMessage(text, description);
    if (!message) return;
    loadToastModule().then(({ showToast: nxShowToast, VARIANT_ERROR }) => {
      nxShowToast({
        text: message,
        variant: variant === 'error' ? VARIANT_ERROR : undefined,
      });
    });
  }

  updated(changedProps) {
    if (changedProps.has('controller')) {
      this.setupObservers();
      this.syncPanelOpen();
    }
    if (changedProps.has('_draft') && this._draft) this.focusDraftTextarea();
    this.resolvePendingCommentLink();
  }

  async focusDraftTextarea() {
    await this.updateComplete;
    this.shadowRoot?.querySelector('.ew-comment-form .ew-comment-textarea')?.focus();
  }

  checkUrlForComment() {
    const { commentId, cleaned } = parseDeepLink(new URL(window.location.href));
    if (!commentId) return;
    this.openCommentsHost();
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
    this.showToast({ text: 'Error', description, variant: 'error' });
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

  handleMenuSelect(id, comment, threadId) {
    if (id === 'delete') this.handleDeleteComment(comment.id, threadId);
    else if (id === 'link') this.copyThreadLink(threadId);
  }

  canEditComment(comment) {
    if (!comment || !this.currentUser) return false;
    return this.currentUser.id === comment.author?.id;
  }

  copyThreadLink(threadId = this.controller?.selectedThreadId) {
    if (!threadId) return;
    const url = buildDeepLinkUrl(new URL(window.location.href), threadId);
    navigator.clipboard.writeText(url.toString())
      .then(() => {
        this.showToast({ text: 'The link was copied to the clipboard.' });
      })
      .catch(() => {
        this.showToast({
          text: 'Error',
          description: 'Could not copy link to clipboard.',
          variant: 'error',
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
        <div class="ew-comments-scroll">${content}</div>
      </div>
      ${renderConfirmDeleteDialog(this)}
    `;
  }
}

customElements.define('ew-comments', CommentsPanel);

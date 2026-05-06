import { LitElement, html, nothing, createRef, ref } from 'da-lit';
import getSheet from '../../shared/sheet.js';
import * as formatUtils from './helpers/format-utils.js';
import * as reactionUtils from './helpers/reaction-utils.js';
import * as mutations from './helpers/comment-mutations.js';
import { generateColor } from '../../shared/utils.js';
import { buildThreadGroups, findThreadIdForComment } from './helpers/thread-utils.js';
import { buildDeepLinkUrl, parseDeepLink } from './helpers/deep-link.js';

const sheet = await getSheet('/blocks/edit/da-comments/da-comments.css');

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);
const COMMENT_SHORTCUT = IS_MAC ? '⌘ + Option + M' : 'Ctrl + Alt + M';
const SUBMIT_SHORTCUT = IS_MAC ? '⌘ + Enter' : 'Ctrl + Enter';

export default class DaComments extends LitElement {
  static properties = {
    controller: { attribute: false },
    currentUser: { state: true },
    _activeTab: { state: true },
    _draft: { state: true },
    _openMenuId: { state: true },
    _openReactionId: { state: true },
    _pendingDelete: { state: true },
    _toast: { state: true },
  };

  _popoverHostRef = createRef();

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

  recomputeThreadGroups() {
    this._threadGroups = buildThreadGroups({
      ymap: this.controller?.ymap,
      attachedIds: this.controller?.getAttachedThreadIds() ?? null,
    });
  }

  syncDraftFromPendingAnchor() {
    if (!this.controller) return;
    if (!this.controller.panelOpen) return;
    const pending = this.controller.pendingAnchor;
    if (!pending) return;
    if (this._draft?.mode === 'new') return;
    this._draft = { mode: 'new', anchorData: pending, text: '' };
    this._activeTab = 'active';
  }

  setupObservers() {
    this.teardownObservers();
    if (!this.controller) return;

    this._unsubController = this.controller.subscribe(({ reason }) => {
      if (reason === 'counts' || reason === 'docChange' || reason === 'init') {
        this.recomputeThreadGroups();
      }
      if (reason === 'panelOpen' && !this.controller.panelOpen) {
        this._draft = null;
      }
      this.requestUpdate();
    });

    const awareness = this.controller.wsProvider?.awareness;
    if (awareness) {
      this._syncUserFromAwareness = () => {
        this.currentUser = awareness.getLocalState()?.user ?? null;
      };
      this._syncUserFromAwareness();
      awareness.on('update', this._syncUserFromAwareness);
    }
  }

  teardownObservers() {
    this._unsubController?.();
    this._unsubController = null;
    if (this._syncUserFromAwareness) {
      this.controller?.wsProvider?.awareness?.off('update', this._syncUserFromAwareness);
      this._syncUserFromAwareness = null;
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.setupObservers();
    import('../../shared/da-dialog/da-dialog.js');
    import('../../shared/da-toast/da-toast.js');
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
    this._openReactionId = null;
  };

  handleClose() {
    if (this._draft) this.cancelDraft();
    this.controller?.closePanel();
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  updated(changedProps) {
    if (changedProps.has('controller')) {
      this.setupObservers();
    }
    if (changedProps.has('_openMenuId') || changedProps.has('_openReactionId')) {
      const anyOpen = this._openMenuId || this._openReactionId;
      if (anyOpen) document.addEventListener('pointerdown', this.handleOutsideClick);
      else document.removeEventListener('pointerdown', this.handleOutsideClick);
    }
    if (changedProps.has('_draft') && this._draft) this.focusDraftTextarea();
    this.resolvePendingCommentLink();
  }

  async focusDraftTextarea() {
    await this.updateComplete;
    const textarea = this.shadowRoot?.querySelector('.da-comment-form sl-textarea');
    if (!textarea) return;
    await textarea.updateComplete;
    const inner = textarea.shadowRoot?.querySelector('textarea');
    (inner ?? textarea).focus();
  }

  checkUrlForComment() {
    const { commentId, cleaned } = parseDeepLink(new URL(window.location.href));
    if (!commentId) return;
    this.dispatchEvent(new CustomEvent('requestOpen', { bubbles: true, composed: true }));
    this._pendingCommentLinkId = commentId;
    this.resolvePendingCommentLink();
    window.history.replaceState({}, '', cleaned.toString());
  }

  resolvePendingCommentLink() {
    if (!this._pendingCommentLinkId || !this.controller) return;
    const threadId = findThreadIdForComment({
      ymap: this.controller.ymap,
      commentId: this._pendingCommentLinkId,
    });
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
    this._draft = { mode: 'reply', threadId: rootComment.id, text: '' };
  }

  startEditDraft(comment) {
    if (!comment) return;
    this._draft = { mode: 'edit', commentId: comment.id, text: comment.body };
    this._openMenuId = null;
  }

  cancelDraft() {
    this._draft = null;
    this._openMenuId = null;
    this._openReactionId = null;
    this.controller?.clearPendingAnchor();
  }

  updateDraftText(event) {
    if (!this._draft) return;
    this._draft = { ...this._draft, text: event.target.value };
  }

  handleDraftKeydown(event) {
    if (event.key === 'Escape') this.cancelDraft();
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.submitDraft(event);
    }
  }

  submitDraft(event) {
    event.preventDefault();
    const body = this._draft?.text?.trim();
    if (!body || !this.currentUser) return;

    const { ymap } = this.controller;
    const user = this.currentUser;
    const draft = this._draft;

    if (draft.mode === 'new') {
      const id = mutations.createRootComment({ ymap, user, anchor: draft.anchorData, body });
      this.controller.setSelectedThread(id);
    } else if (draft.mode === 'reply') {
      mutations.createReply({ ymap, user, threadId: draft.threadId, body });
    } else if (draft.mode === 'edit') {
      mutations.updateBody({ ymap, commentId: draft.commentId, body });
    }

    this.controller.clearPendingAnchor();
    this._draft = null;
  }

  deleteComment(commentId) {
    mutations.deleteComment({ ymap: this.controller.ymap, commentId });
    if (this.controller.selectedThreadId === commentId) {
      this.controller.setSelectedThread(null);
    }
  }

  handleResolveThread(threadId) {
    mutations.resolveThread({
      ymap: this.controller.ymap,
      threadId,
      user: this.currentUser,
    });
    this.cancelDraft();
  }

  handleUnresolveThread(threadId) {
    mutations.unresolveThread({ ymap: this.controller.ymap, threadId, user: this.currentUser });
    this._activeTab = 'active';
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
    this._openReactionId = null;
  }

  toggleReactionPicker(commentId, event) {
    if (event) event.stopPropagation();
    this._openReactionId = this._openReactionId === commentId ? null : commentId;
    this._openMenuId = null;
  }

  handleReaction(comment, emoji) {
    if (!this.currentUser) return;
    reactionUtils.toggleReaction({
      ymap: this.controller.ymap,
      threadId: comment.id,
      emoji,
      user: this.currentUser,
    });
    this._openReactionId = null;
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
        this._toast = { text: 'Copied', description: 'The link was copied to the clipboard.' };
      })
      .catch(() => {
        this._toast = { text: 'Error', description: 'Could not copy link to clipboard.', type: 'error' };
      });
  }

  _avatarColorCache = new Map();

  renderAvatar(author) {
    const key = author.email || author.id || '';
    let color = author.color ?? this._avatarColorCache.get(key);
    if (!color) {
      color = generateColor(key);
      this._avatarColorCache.set(key, color);
    }
    return html`
      <div class="da-comment-avatar" style="background-color: ${color}">
        ${formatUtils.getInitials(author.name)}
      </div>
    `;
  }

  renderForm({
    placeholder, submitLabel, value, formClass = '', showActions = true, onFocus,
  }) {
    return html`
      <form
        @submit=${this.submitDraft}
        @click=${(e) => e.stopPropagation()}
        class=${`da-comment-form ${formClass}`.trim()}>
        <sl-textarea
          placeholder=${placeholder}
          resize="none"
          .value=${value || ''}
          @sl-input=${this.updateDraftText}
          @sl-focus=${onFocus}
          @input=${this.updateDraftText}
          @focus=${onFocus}
          @keydown=${this.handleDraftKeydown}
        ></sl-textarea>
        ${showActions ? html`
          <div class="da-comment-form-actions">
            <span class="da-comment-form-hint"><kbd>${SUBMIT_SHORTCUT}</kbd> to submit</span>
            <sl-button type="button" class="primary outline" @click=${this.cancelDraft}>Cancel</sl-button>
            <sl-button type="submit" ?disabled=${!value?.trim()} @click=${this.submitDraft}>${submitLabel}</sl-button>
          </div>
        ` : nothing}
      </form>
    `;
  }

  renderCommentMenu(comment, threadId, isRoot, canEdit) {
    if (!canEdit && !isRoot) return nothing;
    const isOpen = this._openMenuId === comment.id;

    return html`
      <div class="da-comment-menu" ${isOpen ? ref(this._popoverHostRef) : nothing}>
        <button class="da-comments-btn-menu"
          @click=${(e) => this.toggleMenu(comment.id, e)}
          title="More options"
          aria-label="More options"
          aria-haspopup="true"
          aria-expanded=${isOpen}>
          <span class="da-comments-icon da-comments-icon-more"></span>
        </button>
        ${isOpen ? html`
          <div class="da-comments-menu-dropdown" role="menu" @click=${(e) => e.stopPropagation()}>
            ${canEdit ? html`
              <button class="da-comments-menu-item" role="menuitem" @click=${(e) => { e.stopPropagation(); this.startEditDraft(comment); }}>Edit</button>
              <button class="da-comments-menu-item" role="menuitem" @click=${(e) => { e.stopPropagation(); this.handleDeleteComment(comment.id, threadId); }}>Delete</button>
            ` : nothing}
            ${isRoot ? html`
              <button class="da-comments-menu-item" role="menuitem" @click=${(e) => { e.stopPropagation(); this.copyThreadLink(threadId); }}>Get link to this comment</button>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
    `;
  }

  renderReactions(comment, { reactionsList, isResolved = false, showPicker = true } = {}) {
    const list = reactionsList ?? reactionUtils.getReactionsList(comment);
    const isPickerOpen = this._openReactionId === comment.id;
    const canReact = !isResolved && this.currentUser;

    return html`
      <div class="da-comments-reactions">
        ${list.map((r) => html`
          <button
            class="da-comments-reaction ${reactionUtils.hasUserReacted({ comment, emoji: r.emoji, userId: this.currentUser?.id }) ? 'da-comments-reaction-active' : ''}"
            @click=${() => canReact && this.handleReaction(comment, r.emoji)}
            title="${r.users.map((u) => u.name).join(', ')}"
            ?disabled=${!canReact}>
            <span class="da-comments-reaction-emoji">${r.emoji}</span>
            <span class="da-comments-reaction-count">${r.count}</span>
          </button>
        `)}
        ${canReact && showPicker ? html`
          <div class="da-comments-reaction-picker-wrapper" ${isPickerOpen ? ref(this._popoverHostRef) : nothing}>
            <button class="da-comments-reaction-add"
              @click=${(e) => this.toggleReactionPicker(comment.id, e)}
              title="Add reaction"
              aria-label="Add reaction"
              aria-haspopup="true"
              aria-expanded=${isPickerOpen}>
              <span class="da-comments-icon da-comments-icon-reaction"></span>
            </button>
            ${isPickerOpen ? html`
              <div class="da-comments-reaction-picker" role="menu">
                ${reactionUtils.REACTION_EMOJIS.map((emoji) => html`
                  <button class="da-comments-reaction-picker-item" role="menuitem" aria-label="React with ${emoji}" @click=${() => this.handleReaction(comment, emoji)}>${emoji}</button>
                `)}
              </div>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
    `;
  }

  renderDetachedReference(comment) {
    if (comment.anchorType === 'image') {
      return html`<div class="da-comments-detached-reference">commented on an image.</div>`;
    }
    if (comment.anchorType === 'table') {
      const preview = formatUtils.formatAnchorPreview(comment);
      if (preview === 'a table') {
        return html`<div class="da-comments-detached-reference">commented on a table.</div>`;
      }
      return html`<div class="da-comments-detached-reference">commented on ${preview}</div>`;
    }
    if (!comment.anchorText) return nothing;
    return html`<div class="da-comments-detached-reference">commented on "${comment.anchorText}"</div>`;
  }

  renderComment({
    comment, threadId, isRoot = false, isResolved = false,
    isDetached = false, isPreview = false,
  }) {
    const isEditing = this._draft?.mode === 'edit'
      && this._draft?.commentId === comment.id;
    const canEdit = this.canEditComment(comment);
    const reactionsList = !isPreview ? reactionUtils.getReactionsList(comment) : [];
    const showMenu = !isPreview && !isEditing && !isResolved && (isRoot || canEdit);
    const showResolve = !isPreview && isRoot && !isEditing && !isResolved && !!this.currentUser;
    const showReactions = !isPreview
      && (reactionsList.length > 0 || (!isResolved && this.currentUser));

    return html`
      <div class="da-comment ${isRoot ? 'da-comment-root' : 'da-comment-reply'}">
        <div class="da-comment-header">
          ${this.renderAvatar(comment.author)}
          <div class="da-comment-meta">
            <span class="da-comment-author">${comment.author.name}</span>
            ${isDetached ? this.renderDetachedReference(comment) : nothing}
            <span class="da-comment-time" title="${formatUtils.formatFullTimestamp(comment.createdAt)}">
              ${formatUtils.formatTimestamp(comment.createdAt)}${comment.edited ? html`<span class="da-comments-edited-indicator" title="Edited ${formatUtils.formatFullTimestamp(comment.editedAt)}"> · Edited</span>` : nothing}
            </span>
          </div>
          ${showResolve || showMenu ? html`
            <div class="da-comment-header-actions" @click=${(e) => e.stopPropagation()}>
              ${showResolve ? html`
                <button class="da-comments-btn-resolve" @click=${() => this.handleResolveThread(threadId)} title="Resolve">
                  <span class="da-comments-icon da-comments-icon-checkmark"></span>
                </button>
              ` : nothing}
              ${showMenu ? this.renderCommentMenu(comment, threadId, isRoot, canEdit) : nothing}
            </div>
          ` : nothing}
        </div>
        ${isEditing ? this.renderForm({
            placeholder: 'Edit comment...',
            submitLabel: 'Save',
            value: this._draft?.text || '',
            formClass: 'da-comments-edit-form',
          }) : html`
          <div class="da-comment-content ${isPreview ? 'is-clamped' : ''}">${comment.body}</div>
          ${showReactions ? this.renderReactions(comment, { reactionsList, isResolved, showPicker: !isPreview }) : nothing}
        `}
      </div>
    `;
  }

  renderListView(viewModel) {
    if (this._draft?.mode === 'new' && this.currentUser) {
      const preview = formatUtils.formatAnchorPreview(this._draft.anchorData);
      return html`
        <div class="da-comment-card da-comments-inline-composer">
          <div class="da-comment-header">
            ${this.renderAvatar(this.currentUser)}
            <div class="da-comment-meta">
              <span class="da-comment-author">${this.currentUser.name}</span>
            </div>
          </div>
          ${preview ? html`
            <div class="da-comments-compose-anchor-preview" title=${preview}>
              <span class="da-comments-compose-anchor-label">Commenting on</span>
              <span class="da-comments-compose-anchor-text">${preview}</span>
            </div>
          ` : nothing}
          ${this.renderForm({
            placeholder: 'Add a comment...',
            submitLabel: 'Comment',
            value: this._draft?.text || '',
          })}
        </div>
      `;
    }

    if (!this.controller) {
      return html`<div class="da-comments-list"><p class="da-comments-empty">Loading…</p></div>`;
    }

    const { tabCounts, visibleThreads } = viewModel;
    const tabs = [
      { id: 'active', label: 'Active', count: tabCounts.active },
      { id: 'resolved', label: 'Resolved', count: tabCounts.resolved },
    ].filter((t) => t.count > 0 || t.id === 'active');

    return html`
      <div class="da-comments-list">
        <p class="da-comments-hint">
          Select content and press <kbd>${COMMENT_SHORTCUT}</kbd> to add a comment.
        </p>
        ${tabs.length > 1 ? html`
          <div class="da-comment-tabs" role="tablist" aria-label="Comment thread categories">
            ${tabs.map((tab) => html`
              <button
                class="da-comment-tab ${this._activeTab === tab.id ? 'is-active' : ''}"
                role="tab"
                aria-selected=${this._activeTab === tab.id}
                @click=${() => { this._activeTab = tab.id; }}>
                <span class="da-comment-tab-label">${tab.label}</span>
                <span class="da-comment-tab-count">(${tab.count})</span>
              </button>
            `)}
          </div>
        ` : nothing}
        ${visibleThreads.length > 0 ? html`
          <ul class="da-comments-threads-list">
            ${visibleThreads.map((thread) => this.renderThreadPreview(thread))}
          </ul>
        ` : html`
          <p class="da-comments-empty">${this._activeTab === 'resolved' ? 'No resolved comments' : 'No comments yet'}</p>
        `}
      </div>
    `;
  }

  renderStatusLine(label, user, at) {
    if (!user) return nothing;
    return html`
      <span class="da-comments-resolved-info" title="${at ? formatUtils.formatFullTimestamp(at) : ''}">
        ${label} ${user.name} · ${at ? formatUtils.formatTimestamp(at) : ''}
      </span>
    `;
  }

  renderThreadPreview(thread) {
    const { id: threadId, replies, isDetached, isResolved } = thread;
    return html`
      <li>
        <div
          class="da-comment-card da-comments-thread-surface is-preview ${thread.resolved ? 'resolved' : ''}"
          @click=${() => this.selectThread(threadId)}>
          ${isDetached ? html`<span class="da-comments-detached-badge" title="Original content was deleted"><span class="da-comments-icon da-comments-icon-detached"></span></span>` : nothing}
          ${this.renderComment({
              comment: thread,
              threadId,
              isRoot: true,
              isResolved,
              isDetached,
              isPreview: true,
            })}
          ${replies.length > 0 ? html`
            <span class="da-comments-thread-replies-summary">
              ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}${formatUtils.getReplySummary({ rootComment: thread, replies })}
            </span>
          ` : nothing}
          ${isResolved
            ? this.renderStatusLine('Resolved by', thread.resolvedBy, thread.resolvedAt)
            : this.renderStatusLine('Reopened by', thread.reopenedBy, thread.reopenedAt)}
        </div>
      </li>
    `;
  }

  renderThreadView(thread) {
    const { id: threadId, replies, isDetached, isResolved } = thread;
    const isReplying = this._draft?.mode === 'reply'
      && this._draft?.threadId === threadId;

    return html`
      <div class="da-comments-thread-detail">
        <button class="da-comments-back-btn" @click=${this.backToList}>
          <span class="da-comments-icon da-comments-icon-chevron-left"></span>
          Back
        </button>
        <div class="da-comment-card ${thread.resolved ? 'resolved' : ''}">
          ${this.renderComment({ comment: thread, threadId, isRoot: true, isResolved, isDetached })}
          ${replies.length > 0 ? html`
            <div class="da-comment-replies">
              ${replies.map((reply) => this.renderComment({ comment: reply, threadId, isResolved }))}
            </div>
          ` : nothing}
          ${isResolved ? html`
            <div class="da-comment-thread-actions">
              <sl-button class="primary outline" @click=${() => this.handleUnresolveThread(threadId)}>Reopen</sl-button>
              <sl-button class="negative" @click=${() => this.handleDeleteThread(threadId)}>Delete thread</sl-button>
            </div>
          ` : html`
            <div class="da-comments-reply-form ${isReplying ? 'da-comments-reply-form-expanded' : ''}">
              ${this.renderForm({
                placeholder: 'Add a Reply...',
                submitLabel: 'Reply',
                value: isReplying ? (this._draft?.text || '') : '',
                showActions: isReplying,
                onFocus: () => { if (!isReplying) this.startReplyDraft(thread); },
              })}
            </div>
          `}
        </div>
      </div>
    `;
  }

  renderConfirmDeleteDialog() {
    if (!this._pendingDelete) return nothing;
    return html`
      <da-dialog
        title="Delete thread?"
        .action=${{ style: 'negative', label: 'Delete', click: () => this.handleConfirmDeleteComment() }}
        @close=${() => { this._pendingDelete = null; }}>
        <p>Deleting the comment will remove the entire thread.</p>
      </da-dialog>
    `;
  }

  render() {
    const { active, detached, resolved } = this._threadGroups
      ?? { active: [], detached: [], resolved: [] };
    const activeThreads = [...active, ...detached];
    const visibleThreads = this._activeTab === 'resolved' ? resolved : activeThreads;
    const tabCounts = { active: activeThreads.length, resolved: resolved.length };

    const selectedThread = this.getThreadById(this.controller?.selectedThreadId);
    const content = selectedThread
      ? this.renderThreadView(selectedThread)
      : this.renderListView({ visibleThreads, tabCounts });

    const isComposing = this._draft?.mode === 'new' && this.currentUser;
    const isPinned = isComposing || Boolean(selectedThread);

    return html`
      <div class="da-comments-panel ${isPinned ? 'is-pinned' : ''}">
        <p class="da-comments-title">
          <button
            class="da-comments-close-btn"
            @click=${this.handleClose}
            aria-label="Comments (${this.activeThreadCount}) — close pane">Comments (${this.activeThreadCount})</button>
        </p>
        ${content}
      </div>
      ${this.renderConfirmDeleteDialog()}
      <da-toast .toast=${this._toast} @close=${() => { this._toast = null; }}></da-toast>
    `;
  }
}

customElements.define('da-comments', DaComments);

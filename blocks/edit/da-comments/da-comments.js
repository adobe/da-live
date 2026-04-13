import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../shared/sheet.js';
import * as formatUtils from './helpers/format-utils.js';
import * as reactionUtils from './helpers/reaction-utils.js';
import { generateColor } from '../../shared/utils.js';
import { getDefaultCommentsState } from '../prose/plugins/comments/helpers/store.js';

const sheet = await getSheet('/blocks/edit/da-comments/da-comments.css');

export default class DaComments extends LitElement {
  static properties = {
    commentsStore: { attribute: false },
    currentUser: { attribute: false },
    open: { type: Boolean },
    _activeTab: { state: true },
    _draft: { state: true },
    _popover: { state: true },
    _toast: { state: true },
    _commentsState: { state: true },
  };

  get threadGroups() { return this._commentsState.threadGroups; }

  get selectedThreadId() { return this._commentsState.selectedThreadId; }

  get canAddComment() { return this._commentsState.canAddComment; }

  get activeThreadCount() {
    const { active, detached } = this.threadGroups;
    return active.length + detached.length;
  }

  constructor() {
    super();
    this._activeTab = 'active';
    this._commentsState = getDefaultCommentsState();
    this.handleCommentsStateChange = this.handleCommentsStateChange.bind(this);
  }

  subscribeToStore() {
    this._unsubscribeCommentsState?.();
    this._unsubscribeCommentsState = this.commentsStore
      ?.subscribe(this.handleCommentsStateChange) ?? null;

    if (!this.commentsStore) {
      this.handleCommentsStateChange(getDefaultCommentsState());
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.subscribeToStore();
    import('../../shared/da-dialog/da-dialog.js');
    import('../../shared/da-toast/da-toast.js');
    this.checkUrlForComment();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeCommentsState?.();
    this._unsubscribeCommentsState = null;
    document.removeEventListener('pointerdown', this.handleOutsideClick);
    clearTimeout(this._scrollTimeoutId);
  }

  handleCommentsStateChange(commentsState) {
    const prevThreadId = this.selectedThreadId;
    this._commentsState = commentsState;

    if (this.selectedThreadId !== prevThreadId && this.selectedThreadId) {
      this.cancelDraft();
      this.emitRequestOpen();
      requestAnimationFrame(() => {
        const panel = this.shadowRoot?.querySelector('.da-comments-panel');
        if (panel) panel.scrollTop = 0;
      });
    }

    if (!commentsState.canAddComment && this._draft?.mode === 'new') {
      this.cancelDraft();
    }

    this.resolvePendingCommentLink();
    this.emitStatus();
    this.tryPendingScroll();
  }

  handleOutsideClick = (event) => {
    const path = event.composedPath();
    const isInPopover = path.some((el) => el.classList?.contains('da-menu-dropdown')
      || el.classList?.contains('da-reaction-picker')
      || el.localName === 'da-dialog');
    if (!isInPopover) this._popover = null;
  };

  handleClose() {
    if (this._draft) this.cancelDraft();
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  emitRequestOpen() {
    this.dispatchEvent(new CustomEvent('requestOpen', { bubbles: true, composed: true }));
  }

  emitStatus() {
    this.dispatchEvent(new CustomEvent('statusChanged', {
      bubbles: true,
      composed: true,
      detail: {
        count: this.activeThreadCount,
        canAdd: this.canAddComment,
        hasExplicitSelection: this._commentsState.hasExplicitSelection,
      },
    }));
  }

  updated(changedProps) {
    if (changedProps.has('commentsStore')) {
      this.subscribeToStore();
      this.checkUrlForComment();
    }
    if (changedProps.has('open') && this.open && !changedProps.get('open')) {
      if (this.canAddComment && !this._draft && !this.selectedThreadId) {
        this.startAddComment();
      }
    }
    if (changedProps.has('_popover')) {
      if (this._popover) {
        document.addEventListener('pointerdown', this.handleOutsideClick);
      } else {
        document.removeEventListener('pointerdown', this.handleOutsideClick);
      }
    }
    this.resolvePendingCommentLink();
    this.tryPendingScroll();
  }

  checkUrlForComment() {
    const url = new URL(window.location.href);
    const commentId = url.searchParams.get('comment');
    if (!commentId) return;
    this.emitRequestOpen();
    this._pendingCommentLinkId = commentId;
    this.resolvePendingCommentLink();
    url.searchParams.delete('comment');
    window.history.replaceState({}, '', url.toString());
  }

  resolvePendingCommentLink() {
    if (!this._pendingCommentLinkId || !this.commentsStore) return;

    const threadId = this.commentsStore.getThreadIdForComment(this._pendingCommentLinkId)
      ?? (this.getThreadById(this._pendingCommentLinkId) ? this._pendingCommentLinkId : null);

    if (!threadId) return;

    this._pendingCommentLinkId = null;
    this._pendingScrollToThreadId = threadId;
    this.commentsStore.setSelectedThread(threadId);
  }

  tryPendingScroll() {
    if (!this._pendingScrollToThreadId) return;
    if (!this.getThreadById(this._pendingScrollToThreadId)) return;
    const targetId = this._pendingScrollToThreadId;
    this._pendingScrollToThreadId = null;
    this._scrollTimeoutId = setTimeout(
      () => { this.commentsStore?.scrollThreadIntoView(targetId); },
      400,
    );
  }

  getThreadById(threadId) {
    if (!threadId) return null;
    const allThreads = [
      ...this.threadGroups.active,
      ...this.threadGroups.detached,
      ...this.threadGroups.resolved,
    ];
    return allThreads.find((thread) => thread.threadId === threadId) ?? null;
  }

  focusCommentTextarea() {
    requestAnimationFrame(() => {
      const field = this.shadowRoot?.querySelector('.da-comment-form sl-textarea');
      const textarea = field?.shadowRoot?.querySelector('textarea');
      if (textarea) { textarea.focus(); return; }
      if (field) field.focus();
    });
  }

  selectThread(threadId) {
    this.commentsStore?.setSelectedThread(threadId);
    this.cancelDraft();
    this._pendingScrollToThreadId = threadId;
  }

  backToList() {
    this.commentsStore?.setSelectedThread(null);
    this.cancelDraft();
  }

  startAddComment() {
    if (!this.currentUser) return;
    const selection = this.commentsStore?.beginNewCommentDraft();
    if (!selection) return;
    this._draft = { mode: 'new', selection, text: '' };
    this._activeTab = 'active';
    this.focusCommentTextarea();
  }

  startReplyDraft(parentComment) {
    this._draft = { mode: 'reply', parentId: parentComment.id, text: '' };
  }

  startEditDraft(comment) {
    if (!comment) return;
    this._draft = { mode: 'edit', commentId: comment.id, text: comment.content };
    this._popover = null;
  }

  cancelDraft() {
    this._draft = null;
    this._popover = null;
    this.commentsStore?.clearPendingRange();
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
    const content = this._draft?.text?.trim();
    if (!content || !this.currentUser) return;

    const { mode, selection, parentId, commentId } = this._draft;
    if (mode === 'new' && selection) {
      this.commentsStore?.submitComment({ selection, user: this.currentUser, content });
    } else if (mode === 'reply' && parentId) {
      this.commentsStore?.submitReply({ parentId, user: this.currentUser, content });
    } else if (mode === 'edit' && commentId) {
      this.commentsStore?.updateComment({ commentId, changes: { content } });
    }
    this.cancelDraft();
    this.shadowRoot?.activeElement?.blur();
  }

  handleResolveThread(threadId) {
    this.commentsStore?.resolveThread({ threadId, user: this.currentUser });
    this.cancelDraft();
  }

  handleUnresolveThread(threadId) {
    this.commentsStore?.unresolveThread({ threadId, user: this.currentUser });
    this._activeTab = 'active';
  }

  handleDeleteComment(commentId, threadId = this.selectedThreadId) {
    this._popover = null;
    const thread = this.getThreadById(threadId);
    if (!thread) return;

    if (thread.rootComment?.id === commentId && thread.replies.length > 0) {
      this._popover = { type: 'delete-comment', commentId };
      return;
    }
    this.commentsStore?.deleteComment(commentId);
  }

  handleConfirmDeleteComment() {
    if (this._popover?.type !== 'delete-comment') return;
    this.commentsStore?.deleteComment(this._popover.commentId);
    this._popover = null;
  }

  handleDeleteThread(threadId) {
    this.commentsStore?.deleteThread(threadId);
    this.cancelDraft();
    this._activeTab = 'active';
  }

  togglePopover(type, targetId, event) {
    if (event) event.stopPropagation();
    const isOpen = this._popover?.type === type && this._popover.targetId === targetId;
    this._popover = isOpen ? null : { type, targetId };
  }

  handleReaction(comment, emoji) {
    if (!this.currentUser) return;
    const updated = reactionUtils.toggleReaction({ comment, emoji, user: this.currentUser });
    this.commentsStore?.updateComment({
      commentId: comment.id,
      changes: { reactions: updated.reactions },
    });
    this._popover = null;
  }

  canEditComment(comment) {
    if (!comment || !this.currentUser) return false;
    return this.currentUser.id === comment.author?.id;
  }

  copyThreadLink(threadId = this.selectedThreadId) {
    if (!threadId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('comment', threadId);
    this._popover = null;
    navigator.clipboard.writeText(url.toString())
      .then(() => {
        this._toast = { text: 'Copied', description: 'The link was copied to the clipboard.' };
      })
      .catch(() => {
        this._toast = { text: 'Error', description: 'Could not copy link to clipboard.', type: 'error' };
      });
  }

  renderAvatar(author) {
    const color = generateColor(author.email || author.id);
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
            <sl-button type="button" class="primary outline" @click=${this.cancelDraft}>Cancel</sl-button>
            <sl-button type="submit" ?disabled=${!value?.trim()} @click=${this.submitDraft}>${submitLabel}</sl-button>
          </div>
        ` : nothing}
      </form>
    `;
  }

  renderCommentMenu(comment, threadId, isRoot, canEdit) {
    if (!canEdit && !isRoot) return nothing;
    const isOpen = this._popover?.type === 'menu'
      && this._popover.targetId === comment.id;

    return html`
      <div class="da-comment-menu">
        <button class="da-btn-menu"
          @click=${(e) => this.togglePopover('menu', comment.id, e)}
          title="More options">
          <span class="da-icon da-icon-more"></span>
        </button>
        ${isOpen ? html`
          <div class="da-menu-dropdown" @click=${(e) => e.stopPropagation()}>
            ${canEdit ? html`
              <button class="da-menu-item" @click=${(e) => { e.stopPropagation(); this.startEditDraft(comment); }}>Edit</button>
              <button class="da-menu-item" @click=${(e) => { e.stopPropagation(); this.handleDeleteComment(comment.id, threadId); }}>Delete</button>
            ` : nothing}
            ${isRoot ? html`
              <button class="da-menu-item" @click=${(e) => { e.stopPropagation(); this.copyThreadLink(threadId); }}>Get link to this comment</button>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
    `;
  }

  renderReactions(comment, { isResolved = false, showPicker = true } = {}) {
    const reactionsList = reactionUtils.getReactionsList(comment);
    const isPickerOpen = this._popover?.type === 'reactions'
      && this._popover.targetId === comment.id;
    const canReact = !isResolved && this.currentUser;

    return html`
      <div class="da-reactions">
        ${reactionsList.map((r) => html`
          <button
            class="da-reaction ${reactionUtils.hasUserReacted({ comment, emoji: r.emoji, userId: this.currentUser?.id }) ? 'da-reaction-active' : ''}"
            @click=${() => canReact && this.handleReaction(comment, r.emoji)}
            title="${r.users.map((u) => u.name).join(', ')}"
            ?disabled=${!canReact}>
            <span class="da-reaction-emoji">${r.emoji}</span>
            <span class="da-reaction-count">${r.count}</span>
          </button>
        `)}
        ${canReact && showPicker ? html`
          <div class="da-reaction-picker-wrapper">
            <button class="da-reaction-add"
              @click=${() => this.togglePopover('reactions', comment.id)}
              title="Add reaction">
              <span class="da-icon da-icon-reaction"></span>
            </button>
            ${isPickerOpen ? html`
              <div class="da-reaction-picker">
                ${reactionUtils.REACTION_EMOJIS.map((emoji) => html`
                  <button class="da-reaction-picker-item" @click=${() => this.handleReaction(comment, emoji)}>${emoji}</button>
                `)}
              </div>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
    `;
  }

  renderDetachedReference(comment) {
    const ref = comment.selectedText || (comment.isImage ? 'an image' : null);
    if (!ref) return nothing;
    return html`<div class="da-detached-reference-body">commented on "${ref}"</div>`;
  }

  renderComment({
    comment, threadId, isRoot = false, isResolved = false,
    isDetached = false, isPreview = false,
  }) {
    const isEditing = this._draft?.mode === 'edit'
      && this._draft?.commentId === comment.id;
    const canEdit = this.canEditComment(comment);
    const showMenu = !isEditing && !isResolved && !isPreview && (isRoot || canEdit);
    const showResolve = isRoot && !isEditing && !isResolved && !isPreview && !!this.currentUser;
    const showReactions = !isPreview
      && (reactionUtils.getReactionsList(comment).length > 0 || (!isResolved && this.currentUser));

    return html`
      <div class="da-comment ${isRoot ? 'da-comment-root' : 'da-comment-reply'}">
        <div class="da-comment-header">
          ${this.renderAvatar(comment.author)}
          <div class="da-comment-meta">
            <span class="da-comment-author">${comment.author.name}</span>
            ${isDetached ? this.renderDetachedReference(comment) : nothing}
            <span class="da-comment-time" title="${formatUtils.formatFullTimestamp(comment.createdAt)}">
              ${formatUtils.formatTimestamp(comment.createdAt)}${formatUtils.wasEdited(comment) ? html`<span class="da-edited-indicator" title="Edited ${formatUtils.formatFullTimestamp(comment.updatedAt)}"> · Edited</span>` : nothing}
            </span>
          </div>
          ${showResolve || showMenu ? html`
            <div class="da-comment-header-actions" @click=${(e) => e.stopPropagation()}>
              ${showResolve ? html`
                <button class="da-btn-resolve-icon" @click=${() => this.handleResolveThread(threadId)} title="Resolve">
                  <span class="da-icon da-icon-checkmark"></span>
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
            formClass: 'da-edit-form',
          }) : html`
          <div class="da-comment-content ${isPreview ? 'is-clamped' : ''}">${comment.content}</div>
          ${showReactions ? this.renderReactions(comment, { isResolved, showPicker: !isPreview }) : nothing}
        `}
      </div>
    `;
  }

  renderListView(viewModel) {
    if (this._draft?.mode === 'new' && this.currentUser) {
      return html`
        <div class="da-comment-card da-inline-composer">
          <div class="da-comment-header">
            ${this.renderAvatar(this.currentUser)}
            <div class="da-comment-meta">
              <span class="da-comment-author">${this.currentUser.name}</span>
            </div>
          </div>
          ${this.renderForm({
            placeholder: 'Add a comment...',
            submitLabel: 'Comment',
            value: this._draft?.text || '',
          })}
        </div>
      `;
    }

    const { tabCounts, visibleThreads } = viewModel;
    const tabs = [
      { id: 'active', label: 'Active', count: tabCounts.active },
      { id: 'resolved', label: 'Resolved', count: tabCounts.resolved },
    ].filter((t) => t.count > 0 || t.id === 'active');

    return html`
      <div class="da-comments-list">
        <button
          class="da-add-comment-btn"
          @click=${this.startAddComment}
          ?disabled=${!this.canAddComment}
          title=${this.canAddComment ? 'Add comment' : 'Select text to comment'}>
          <span class="da-icon da-icon-add"></span>
          Add comment
        </button>
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
          <ul class="da-threads-list">
            ${visibleThreads.map((thread) => this.renderThreadPreview(thread))}
          </ul>
        ` : html`
          <p class="da-no-comments">${this._activeTab === 'resolved' ? 'No resolved comments' : 'No comments yet'}</p>
        `}
      </div>
    `;
  }

  renderThreadPreview({ threadId, rootComment, replies, isDetached, isResolved }) {
    return html`
      <li>
        <div
          class="da-comment-card da-thread-surface is-preview ${rootComment.resolved ? 'resolved' : ''}"
          @click=${() => this.selectThread(threadId)}>
          ${isDetached ? html`<span class="da-detached-badge" title="Original content was deleted"><span class="da-icon da-icon-detached"></span></span>` : nothing}
          ${this.renderComment({
              comment: rootComment,
              threadId,
              isRoot: true,
              isResolved,
              isDetached,
              isPreview: true,
            })}
          ${replies.length > 0 ? html`
            <span class="da-thread-replies-summary">
              ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}${formatUtils.getReplySummary({ rootComment, replies })}
            </span>
          ` : nothing}
          ${isResolved && rootComment.resolvedBy ? html`
            <span class="da-resolved-info"
              title="${rootComment.resolvedAt ? formatUtils.formatFullTimestamp(rootComment.resolvedAt) : ''}">
              Resolved by ${rootComment.resolvedBy.name} · ${rootComment.resolvedAt ? formatUtils.formatTimestamp(rootComment.resolvedAt) : ''}
            </span>
          ` : nothing}
          ${!isResolved && rootComment.reopenedBy ? html`
            <span class="da-resolved-info"
              title="${rootComment.reopenedAt ? formatUtils.formatFullTimestamp(rootComment.reopenedAt) : ''}">
              Reopened by ${rootComment.reopenedBy.name} · ${rootComment.reopenedAt ? formatUtils.formatTimestamp(rootComment.reopenedAt) : ''}
            </span>
          ` : nothing}
        </div>
      </li>
    `;
  }

  renderThreadView(thread) {
    const { threadId, rootComment, replies, isDetached, isResolved } = thread;
    const isReplying = this._draft?.mode === 'reply'
      && this._draft?.parentId === rootComment.id;

    return html`
      <div class="da-thread-detail">
        <button class="da-back-btn" @click=${this.backToList}>
          <span class="da-icon da-icon-chevron-left"></span>
          Back
        </button>
        <div class="da-comment-card ${rootComment.resolved ? 'resolved' : ''}">
          ${this.renderComment({ comment: rootComment, threadId, isRoot: true, isResolved, isDetached })}
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
            <div class="da-reply-form ${isReplying ? 'da-reply-form-expanded' : ''}">
              ${this.renderForm({
                placeholder: 'Add a Reply...',
                submitLabel: 'Reply',
                value: isReplying ? (this._draft?.text || '') : '',
                showActions: isReplying,
                onFocus: () => { if (!isReplying) this.startReplyDraft(rootComment); },
              })}
            </div>
          `}
        </div>
      </div>
    `;
  }

  renderConfirmDeleteDialog() {
    if (this._popover?.type !== 'delete-comment') return nothing;
    return html`
      <da-dialog
        title="Delete thread?"
        .action=${{ style: 'negative', label: 'Delete', click: () => this.handleConfirmDeleteComment() }}
        @close=${() => { this._popover = null; }}>
        <p>Deleting the comment will remove the entire thread.</p>
      </da-dialog>
    `;
  }

  render() {
    const { active, detached, resolved } = this.threadGroups;
    const { selectedThread } = this._commentsState;
    const activeThreads = [...active, ...detached];
    const visibleThreads = this._activeTab === 'resolved' ? resolved : activeThreads;
    const tabCounts = { active: activeThreads.length, resolved: resolved.length };

    const content = (this.selectedThreadId && selectedThread)
      ? this.renderThreadView(selectedThread)
      : this.renderListView({ visibleThreads, tabCounts });

    return html`
      <div class="da-comments-panel">
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

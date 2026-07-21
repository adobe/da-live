/* eslint-disable no-underscore-dangle */

import { html, nothing } from 'da-lit';
import * as formatUtils from './format-utils.js';
import { DRAFT_MODES } from './draft-state.js';
import { generateColorSet } from '../../editor-utils/author-color.js';

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);
export const COMMENT_SHORTCUT = IS_MAC ? '⌘ + Option + M' : 'Ctrl + Alt + M';
export const SUBMIT_SHORTCUT = IS_MAC ? '⌘ + Enter' : 'Ctrl + Enter';

const ICONS = {
  checkmark: '/img/icons/s2-icon-checkmark-20-n.svg',
  'chevron-left': '/img/icons/s2-icon-chevronleft-20-n.svg',
  more: '/img/icons/s2-icon-more-20-n.svg',
  detached: '/img/icons/s2-icon-alerttriangle-20-n.svg',
};

function renderIcon(name) {
  return html`<svg class="ew-comments-icon ew-comments-icon-${name}" viewBox="0 0 20 20" aria-hidden="true"><use href="${ICONS[name]}#icon"></use></svg>`;
}

export function renderAvatar(panel, author) {
  const set = panel.controller?.authorColorSet
    ? panel.controller.authorColorSet(author)
    : generateColorSet(author.email || author.id || '');
  return html`
    <div class="ew-comment-avatar" style="background-color: ${set.bg}; color: ${set.text}">
      ${formatUtils.getInitials(author.name)}
    </div>
  `;
}

export function renderForm(panel, {
  placeholder, submitLabel, value, formClass = '', showActions = true, onFocus,
}) {
  return html`
    <form
      @submit=${panel.submitDraft}
      @click=${(e) => e.stopPropagation()}
      class=${`ew-comment-form ${formClass}`.trim()}>
      <sl-textarea
        placeholder=${placeholder}
        resize="none"
        .value=${value || ''}
        ?disabled=${panel._submitting}
        @sl-input=${panel.updateDraftText}
        @sl-focus=${onFocus}
        @input=${panel.updateDraftText}
        @focus=${onFocus}
        @keydown=${panel.handleDraftKeydown}
      ></sl-textarea>
      ${showActions ? html`
        <div class="ew-comment-form-actions">
          <sl-button type="button" class="primary outline" @click=${panel.cancelDraft}>Cancel</sl-button>
          <sl-button type="submit" ?disabled=${!value?.trim() || panel._submitting} @click=${panel.submitDraft}>
            ${panel._submitting
              ? html`Saving <span class="ew-comments-btn-spinner" role="status" aria-label="Saving"></span>`
              : submitLabel}
          </sl-button>
        </div>
        <div class="ew-comment-form-hint"><kbd>${SUBMIT_SHORTCUT}</kbd> to submit</div>
      ` : nothing}
    </form>
  `;
}

export function renderCommentMenu(panel, comment, threadId, isRoot, canEdit) {
  if (!canEdit && !isRoot) return nothing;
  const items = [
    ...(canEdit ? [{ id: 'delete', label: 'Delete' }] : []),
    ...(isRoot ? [{ id: 'link', label: 'Get link to this comment' }] : []),
  ];

  return html`
    <nx-menu
      placement="below"
      .items=${items}
      @select=${(e) => panel.handleMenuSelect(e.detail.id, comment, threadId)}>
      <button slot="trigger" class="ew-comments-btn-menu"
        title="More options" aria-label="More options"
        @click=${(e) => e.stopPropagation()}>
        ${renderIcon('more')}
      </button>
    </nx-menu>
  `;
}

export function renderDetachedReference(comment) {
  if (comment.anchorType === 'image') {
    return html`<div class="ew-comments-detached-reference">commented on an image.</div>`;
  }
  if (comment.anchorType === 'table') {
    const preview = formatUtils.formatAnchorPreview(comment);
    if (preview === 'a table') {
      return html`<div class="ew-comments-detached-reference">commented on a table.</div>`;
    }
    return html`<div class="ew-comments-detached-reference">commented on ${preview}</div>`;
  }
  if (!comment.anchorText) return nothing;
  return html`<div class="ew-comments-detached-reference">commented on "${comment.anchorText}"</div>`;
}

export function renderComment(panel, {
  comment, threadId, isRoot = false, isResolved = false,
  isDetached = false, isPreview = false,
}) {
  const canEdit = panel.canEditComment(comment);
  const showMenu = !isPreview && !isResolved && (isRoot || canEdit);
  const showResolve = !isPreview && isRoot && !isResolved && !!panel.currentUser;

  const isSpinning = !isRoot && panel._submittingId === comment.id;
  return html`
    <div class="ew-comment ${isRoot ? 'ew-comment-root' : 'ew-comment-reply'} ${isSpinning ? 'is-loading' : ''}">
      ${isSpinning ? html`<div class="ew-comments-spinner-overlay"></div>` : nothing}
      <div class="ew-comment-header">
        ${renderAvatar(panel, comment.author)}
        <div class="ew-comment-meta">
          <span class="ew-comment-author">${comment.author.name}</span>
          ${isDetached ? renderDetachedReference(comment) : nothing}
          <span class="ew-comment-time" title="${formatUtils.formatFullTimestamp(comment.createdAt)}">
            ${formatUtils.formatTimestamp(comment.createdAt)}
          </span>
        </div>
        ${showResolve || showMenu ? html`
          <div class="ew-comment-header-actions" @click=${(e) => e.stopPropagation()}>
            ${showResolve ? html`
              <button class="ew-comments-btn-resolve" ?disabled=${!!panel._submittingId} @click=${() => panel.handleResolveThread(threadId)} title="Resolve">
                ${renderIcon('checkmark')}
              </button>
            ` : nothing}
            ${showMenu ? renderCommentMenu(panel, comment, threadId, isRoot, canEdit) : nothing}
          </div>
        ` : nothing}
      </div>
      <div class="ew-comment-content ${isPreview ? 'is-clamped' : ''}">${comment.body}</div>
    </div>
  `;
}

export function renderStatusLine(label, user, at) {
  if (!user) return nothing;
  return html`
    <span class="ew-comments-resolved-info" title="${at ? formatUtils.formatFullTimestamp(at) : ''}">
      ${label} ${user.name} · ${at ? formatUtils.formatTimestamp(at) : ''}
    </span>
  `;
}

export function renderThreadPreview(panel, thread) {
  const { id: threadId, replies, isDetached, isResolved } = thread;
  return html`
    <li>
      <div
        class="ew-comment-card ew-comments-thread-surface is-preview ${thread.resolved ? 'resolved' : ''}"
        @click=${() => panel.selectThread(threadId)}>
        ${isDetached ? html`<span class="ew-comments-detached-badge" title="Original content was deleted">${renderIcon('detached')}</span>` : nothing}
        ${renderComment(panel, {
            comment: thread,
            threadId,
            isRoot: true,
            isResolved,
            isDetached,
            isPreview: true,
          })}
        ${replies.length > 0 ? html`
          <span class="ew-comments-thread-replies-summary">
            ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}${formatUtils.getReplySummary({ rootComment: thread, replies })}
          </span>
        ` : nothing}
        ${isResolved
          ? renderStatusLine('Resolved by', thread.resolvedBy, thread.resolvedAt)
          : renderStatusLine('Reopened by', thread.reopenedBy, thread.reopenedAt)}
      </div>
    </li>
  `;
}

export function renderListView(panel, viewModel) {
  if (panel._draft?.mode === DRAFT_MODES.NEW && panel.currentUser) {
    const preview = formatUtils.formatAnchorPreview(panel._draft.anchorData);
    return html`
      <div class="ew-comment-card ew-comments-inline-composer">
        <div class="ew-comment-header">
          ${renderAvatar(panel, panel.currentUser)}
          <div class="ew-comment-meta">
            <span class="ew-comment-author">${panel.currentUser.name}</span>
          </div>
        </div>
        ${preview ? html`
          <div class="ew-comments-compose-anchor-preview" title=${preview}>
            <span class="ew-comments-compose-anchor-label">Commenting on</span>
            <span class="ew-comments-compose-anchor-text">${preview}</span>
          </div>
        ` : nothing}
        ${renderForm(panel, {
          placeholder: 'Add a comment...',
          submitLabel: 'Comment',
          value: panel._draft?.text || '',
        })}
      </div>
    `;
  }

  if (!panel.controller) {
    return html`<div class="ew-comments-list"><p class="ew-comments-empty">Loading…</p></div>`;
  }

  const { tabCounts, visibleThreads } = viewModel;
  const tabs = [
    { id: 'active', label: 'Active', count: tabCounts.active },
    { id: 'resolved', label: 'Resolved', count: tabCounts.resolved },
  ].filter((t) => t.count > 0 || t.id === 'active');

  return html`
    <div class="ew-comments-list">
      <p class="ew-comments-hint">
        Select content and press <kbd>${COMMENT_SHORTCUT}</kbd> to add a comment.
      </p>
      ${tabs.length > 1 ? html`
        <div class="ew-comment-tabs" role="tablist" aria-label="Comment thread categories">
          ${tabs.map((tab) => html`
            <button
              class="ew-comment-tab ${panel._activeTab === tab.id ? 'is-active' : ''}"
              role="tab"
              aria-selected=${panel._activeTab === tab.id}
              @click=${() => { panel._activeTab = tab.id; }}>
              <span class="ew-comment-tab-label">${tab.label}</span>
              <span class="ew-comment-tab-count">(${tab.count})</span>
            </button>
          `)}
        </div>
      ` : nothing}
      ${visibleThreads.length > 0 ? html`
        <ul class="ew-comments-threads-list">
          ${visibleThreads.map((thread) => renderThreadPreview(panel, thread))}
        </ul>
      ` : html`
        <p class="ew-comments-empty">${panel._activeTab === 'resolved' ? 'No resolved comments' : 'No comments yet'}</p>
      `}
    </div>
  `;
}

export function renderThreadView(panel, thread) {
  const { id: threadId, replies, isDetached, isResolved } = thread;
  const isReplying = panel._draft?.mode === DRAFT_MODES.REPLY
    && panel._draft?.threadId === threadId;

  return html`
    <div class="ew-comments-thread-detail">
      <button class="ew-comments-back-btn" @click=${panel.backToList}>
        ${renderIcon('chevron-left')}
        Back
      </button>
      <div class="ew-comment-card ${thread.resolved ? 'resolved' : ''} ${panel._submittingId === threadId ? 'is-loading' : ''}">
        ${panel._submittingId === threadId ? html`<div class="ew-comments-spinner-overlay"></div>` : nothing}
        ${renderComment(panel, { comment: thread, threadId, isRoot: true, isResolved, isDetached })}
        ${replies.length > 0 ? html`
          <div class="ew-comment-replies">
            ${replies.map((reply) => renderComment(panel, { comment: reply, threadId, isResolved }))}
          </div>
        ` : nothing}
        ${isResolved ? html`
          <div class="ew-comment-thread-actions">
            <sl-button class="primary outline" ?disabled=${!!panel._submittingId} @click=${() => panel.handleUnresolveThread(threadId)}>Reopen</sl-button>
            ${panel.canEditComment(thread) ? html`<sl-button class="negative" ?disabled=${!!panel._submittingId} @click=${() => panel.handleDeleteThread(threadId)}>Delete thread</sl-button>` : nothing}
          </div>
        ` : html`
          <div class="ew-comments-reply-form ${isReplying ? 'ew-comments-reply-form-expanded' : ''}">
            ${renderForm(panel, {
              placeholder: 'Add a Reply...',
              submitLabel: 'Reply',
              value: isReplying ? (panel._draft?.text || '') : '',
              showActions: isReplying,
              onFocus: () => { if (!isReplying) panel.startReplyDraft(thread); },
            })}
          </div>
        `}
      </div>
    </div>
  `;
}

export function renderConfirmDeleteDialog(panel) {
  if (!panel._pendingDelete) return nothing;
  return html`
    <da-dialog
      title="Delete thread?"
      .action=${{ style: 'negative', label: 'Delete', click: () => panel.handleConfirmDeleteComment() }}
      @close=${() => { panel._pendingDelete = null; }}>
      <p>Deleting the comment will remove the entire thread.</p>
    </da-dialog>
  `;
}

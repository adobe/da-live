/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { LitElement, html } from 'da-lit';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/da-comment-panel/da-comment-panel.css');

function formatRelativeTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const sec = Math.floor((now - date) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr !== 1 ? 's' : ''} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day !== 1 ? 's' : ''} ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

class DaCommentPanel extends LitElement {
  static properties = {
    comments: { type: Array },
    currentUser: { type: String },
    noBlock: { type: Boolean },
    blockLabel: { type: String },
    _newText: { state: true },
    _editingId: { state: true },
    _editText: { state: true },
  };

  constructor() {
    super();
    this.comments = [];
    this.currentUser = '';
    this.noBlock = false;
    this.blockLabel = '';
    this._newText = '';
    this._editingId = null;
    this._editText = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  close() {
    this.dispatchEvent(new Event('closed'));
    this.remove();
  }

  isOwnComment(comment) {
    return comment.user === this.currentUser;
  }

  handleAdd() {
    const text = this._newText?.trim();
    if (!text) return;
    this.dispatchEvent(new CustomEvent('comment-add', { detail: { text }, bubbles: true }));
    this._newText = '';
  }

  startEdit(comment) {
    this._editingId = comment.id;
    this._editText = comment.text;
  }

  cancelEdit() {
    this._editingId = null;
    this._editText = '';
  }

  saveEdit() {
    const text = this._editText?.trim();
    if (text != null && this._editingId) {
      this.dispatchEvent(new CustomEvent('comment-edit', { detail: { id: this._editingId, text }, bubbles: true }));
    }
    this._editingId = null;
    this._editText = '';
  }

  handleDelete(comment) {
    this.dispatchEvent(new CustomEvent('comment-delete', { detail: { id: comment.id }, bubbles: true }));
  }

  handleKeyDown(e) {
    if (e.key === 'Escape') {
      if (this._editingId) this.cancelEdit();
      else this.close();
    }
  }

  renderComment(comment) {
    const isOwn = this.isOwnComment(comment);
    const isEditing = this._editingId === comment.id;
    return html`
      <li class="comment-item" data-comment-id="${comment.id}">
        ${isEditing
    ? html`
          <div class="comment-edit-row">
            <input
              type="text"
              class="comment-edit-input"
              .value=${this._editText}
              @input=${(e) => { this._editText = e.target.value; }}
              @keydown=${(e) => { if (e.key === 'Enter') this.saveEdit(); if (e.key === 'Escape') this.cancelEdit(); }}
            />
            <div class="comment-edit-actions">
              <button type="button" class="comment-btn comment-btn-cancel" @click=${this.cancelEdit}>Cancel</button>
              <button type="button" class="comment-btn comment-btn-save" @click=${this.saveEdit}>Save</button>
            </div>
          </div>`
    : html`
          <div class="comment-body">${comment.text}</div>
          <div class="comment-meta">${comment.name || comment.user} · ${formatRelativeTime(comment.date)}</div>
          ${isOwn
    ? html`
            <div class="comment-actions">
              <button type="button" class="comment-icon-btn" title="Edit" @click=${() => this.startEdit(comment)} aria-label="Edit comment">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button type="button" class="comment-icon-btn" title="Delete" @click=${() => this.handleDelete(comment)} aria-label="Delete comment">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>`
    : ''}`}
      </li>`;
  }

  render() {
    return html`
      <div class="da-comment-panel" @keydown=${this.handleKeyDown}>
        <header class="comment-panel-header">
          <h5 class="comment-panel-title">Comments${this.blockLabel ? ` for ${this.blockLabel}` : ''}</h5>
          <button type="button" class="comment-close-btn" @click=${this.close} aria-label="Close">×</button>
        </header>
        ${this.noBlock
    ? html`<p class="comment-no-block">Select a block in the editor to view or add comments.</p>`
    : html`
        <ul class="comment-list">
          ${(this.comments || []).map((c) => this.renderComment(c))}
        </ul>
        <div class="comment-add">
          <input
            type="text"
            class="comment-new-input"
            placeholder="Add a comment…"
            .value=${this._newText}
            @input=${(e) => { this._newText = e.target.value; }}
            @keydown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); this.handleAdd(); } }}
          />
          <button type="button" class="comment-add-btn" @click=${this.handleAdd}>Add</button>
        </div>`}
      </div>`;
  }
}

customElements.define('da-comment-panel', DaCommentPanel);
export default DaCommentPanel;

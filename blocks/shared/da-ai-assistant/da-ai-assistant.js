/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/**
 * DA AI Assistant - Native Lit Component
 * 
 * Architecture Decision: This component is built with native Lit, NOT web-fragments.
 * Reasons:
 * - Direct access to IMS token via initIms() (no cross-origin issues)
 * - Simpler architecture (no iframe, no proxy needed)
 * - Full control over UI and state management
 * - Direct API calls to da-chat-api
 * 
 * LOCAL DEV IMAGE LOADING:
 * In production, images are served via content.da.live (public CDN).
 * In local dev, images need authenticated loading because browser <img> requests
 * don't include auth headers. This is handled by:
 * 
 * 1. initLocalDevImageLoader() in shared/utils.js - observes for images in the editor
 * 2. Uses daFetch() to load images via authenticated API calls
 * 3. Replaces image src with blob URLs for display
 * 4. ONLY active when hostname is 'localhost' - production behavior unchanged
 * 
 * The local dev image loader is initialized in da-editor/da-editor.js when the
 * ProseMirror editor is mounted. This approach:
 * - Preserves security (no public sandbox bypass)
 * - Works with user's authenticated session
 * - No changes to da-admin auth logic needed
 */

import { LitElement, html, nothing } from 'da-lit';
import { initIms } from '../../shared/utils.js';
import getSheet from '../../shared/sheet.js';

const CHAT_API_URL = 'http://localhost:3007';
const DB_NAME = 'da-ai-assistant';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';
const MAX_CHATS = 3;
const MAX_IMAGE_SIZE = 800; // Max width/height for uploaded images
const sheet = await getSheet('/blocks/shared/da-ai-assistant/da-ai-assistant.css');

/**
 * IndexedDB helpers for chat persistence
 */
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

async function loadConversations() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const data = request.result || [];
        // Sort by id and limit to MAX_CHATS
        const sorted = data.sort((a, b) => b.id - a.id).slice(0, MAX_CHATS);
        resolve(sorted.length > 0 ? sorted : null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('[DA-AI] Failed to load conversations:', e);
    return null;
  }
}

async function saveConversations(conversations) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    // Clear old data
    store.clear();
    // Save only the latest MAX_CHATS
    const toSave = conversations.slice(0, MAX_CHATS);
    toSave.forEach((conv) => store.put(conv));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[DA-AI] Failed to save conversations:', e);
  }
}

/**
 * Compress and resize image to avoid 413 errors
 */
async function compressImage(file, maxSize = MAX_IMAGE_SIZE) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // Calculate new dimensions
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob for upload
        canvas.toBlob((blob) => {
          resolve({
            name: file.name,
            type: blob.type,
            blob,
            width,
            height,
          });
        }, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.8);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Upload image to DA using the same pattern as the editor:
 * - Upload to hidden folder: .{pagename}/{filename}
 * - Use PUT method like DA editor
 * - Return contentUrl from response for public access
 */
async function uploadImageToDA(blob, filename, context, imsToken) {
  const { org, project, page } = context;
  if (!org || !project) {
    throw new Error('Missing org/project context for upload');
  }

  // Use DA's hidden folder pattern: .{pagename}/{uniqueFilename}
  // This matches how DA editor uploads images (see imageDrop.js)
  const pageName = page || 'index';
  const uniqueFilename = `${Date.now()}-${filename.replace(/\s+/g, '-')}`;
  const hiddenPath = `.${pageName}/${uniqueFilename}`;
  
  const formData = new FormData();
  formData.append('data', blob, filename);

  // Use PUT method like DA editor does
  const url = `http://localhost:8787/source/${org}/${project}/${hiddenPath}`;
  console.log('[DA-AI] Uploading image to:', url);

  const headers = {};
  if (imsToken) {
    headers['Authorization'] = `Bearer ${imsToken}`;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  // DA returns { source: { contentUrl: "https://content.da.live/..." } }
  const json = await response.json();
  const contentUrl = json.source?.contentUrl;
  
  console.log('[DA-AI] Image uploaded successfully:', json);
  console.log('[DA-AI] Content URL:', contentUrl);
  
  // For local dev, content.da.live won't work. Use /source/ path that da-admin serves.
  const isLocal = window.location.hostname === 'localhost';
  let imageUrl = contentUrl;
  
  if (!imageUrl || (isLocal && imageUrl.includes('content.da.live'))) {
    // Local dev: use /source/ path - da-admin has a bypass for hidden folder GETs
    // Production: use content.da.live CDN
    imageUrl = isLocal 
      ? `/source/${org}/${project}/${hiddenPath}`  // da-admin serves this with bypass
      : `https://content.da.live/${org}/${project}/${hiddenPath}`;
  }
  
  console.log('[DA-AI] Final image URL:', imageUrl);
  
  return {
    path: hiddenPath,
    url: imageUrl,
    fullPath: `${org}/${project}/${hiddenPath}`,
    contentUrl: contentUrl || imageUrl,
  };
}

const AVAILABLE_TOOLS = [
  { id: 'da_list_sources', name: 'da_list_sources', enabled: true },
  { id: 'da_get_source', name: 'da_get_source', enabled: true },
  { id: 'da_create_source', name: 'da_create_source', enabled: true },
  { id: 'da_update_source', name: 'da_update_source', enabled: true },
  { id: 'da_delete_source', name: 'da_delete_source', enabled: false },
  { id: 'da_copy_content', name: 'da_copy_content', enabled: true },
  { id: 'da_move_content', name: 'da_move_content', enabled: true },
  { id: 'da_upload_media', name: 'da_upload_media', enabled: true },
];

const PROMPT_LIBRARY = [
  { id: 'create-site', title: 'Help me create a site', description: 'Get assistance creating a new site', tags: ['create', 'content'], prompt: 'Help me create a new site with Document Authoring' },
  { id: 'create-page', title: 'Help me create a new page', description: 'Get assistance creating a new page', tags: ['create', 'content'], prompt: 'Help me create a new page in this site' },
  { id: 'update-page', title: 'Help me update this page', description: 'Get assistance updating the current page', tags: ['update', 'learn'], prompt: 'Help me update the content of this page' },
  { id: 'describe-page', title: 'Describe this page', description: 'Get a description of the current page content', tags: ['read', 'learn'], prompt: 'Describe the content of this page' },
  { id: 'seo-review', title: 'Review SEO', description: 'Get SEO recommendations for this page', tags: ['review', 'optimize'], prompt: 'Review this page for SEO and suggest improvements' },
  { id: 'accessibility', title: 'Check accessibility', description: 'Review accessibility of this page', tags: ['review', 'accessibility'], prompt: 'Review this page for accessibility issues' },
];

function parsePageContext() {
  let path = window.location.pathname;
  if (window.location.hash && window.location.hash.includes('/')) {
    path = window.location.hash.replace('#', '');
  }
  const parts = path.replace(/^\/+|\/+$/g, '').split('/');
  const filteredParts = parts.filter((p) => p !== 'edit' && p !== 'edit#');
  return {
    org: filteredParts[0] || '',
    project: filteredParts[1] || '',
    page: filteredParts.slice(2).join('/') || 'index',
    fullPath: `/${filteredParts.join('/')}`,
  };
}

class DaAiAssistant extends LitElement {
  static properties = {
    isOpen: { type: Boolean, state: true },
    conversations: { type: Array, state: true },
    activeTabId: { type: Number, state: true },
    inputValue: { type: String, state: true },
    isThinking: { type: Boolean, state: true },
    reasoningText: { type: String, state: true },
    reasoningExpanded: { type: Boolean, state: true },
    streamingResponse: { type: String, state: true },
    showToolsPanel: { type: Boolean, state: true },
    showPromptsModal: { type: Boolean, state: true },
    enabledTools: { type: Object, state: true },
    uploadedFiles: { type: Array, state: true },
    toolsUsed: { type: Array, state: true },
  };

  constructor() {
    super();
    this.isOpen = false;
    this.conversations = [{ id: 1, name: 'Chat 1', messages: [] }];
    this.activeTabId = 1;
    this.inputValue = '';
    this.isThinking = false;
    this.reasoningText = '';
    this.reasoningExpanded = false;
    this.streamingResponse = '';
    this.imsToken = null;
    this.showToolsPanel = false;
    this.showPromptsModal = false;
    this.uploadedFiles = [];
    this.toolsUsed = [];
    this.nextTabId = 2;
    this.currentAbortController = null;

    this.enabledTools = {};
    AVAILABLE_TOOLS.forEach((tool) => {
      this.enabledTools[tool.id] = tool.enabled;
    });
  }

  get activeConversation() {
    return this.conversations.find((c) => c.id === this.activeTabId) || this.conversations[0];
  }

  get messages() {
    return this.activeConversation?.messages || [];
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    await this.loadImsToken();
    await this.loadSavedConversations();
  }

  async loadSavedConversations() {
    const saved = await loadConversations();
    if (saved && saved.length > 0) {
      this.conversations = saved;
      this.activeTabId = saved[0].id;
      this.nextTabId = Math.max(...saved.map((c) => c.id)) + 1;
    }
  }

  async persistConversations() {
    await saveConversations(this.conversations);
  }

  async loadImsToken() {
    try {
      const imsDetails = await initIms();
      if (imsDetails?.accessToken?.token) {
        this.imsToken = imsDetails.accessToken.token;
      }
    } catch (e) {
      console.warn('[DA-AI] Could not load IMS token:', e);
    }
  }

  toggleAssistant() {
    this.isOpen = !this.isOpen;
    this.showToolsPanel = false;
    this.showPromptsModal = false;
  }

  // Tab management
  switchTab(tabId) {
    if (tabId !== this.activeTabId) {
      this.activeTabId = tabId;
      this.reasoningText = '';
      this.streamingResponse = '';
      this.requestUpdate();
    }
  }

  addNewTab() {
    // Limit to MAX_CHATS
    if (this.conversations.length >= MAX_CHATS) {
      // Remove oldest chat
      this.conversations = this.conversations.slice(1);
    }
    const newTab = { id: this.nextTabId, name: `Chat ${this.nextTabId}`, messages: [] };
    this.nextTabId += 1;
    this.conversations = [...this.conversations, newTab];
    this.activeTabId = newTab.id;
    this.reasoningText = '';
    this.streamingResponse = '';
    this.persistConversations();
  }

  closeTab(tabId, e) {
    e.stopPropagation();
    if (this.conversations.length <= 1) return;
    const tabIndex = this.conversations.findIndex((c) => c.id === tabId);
    this.conversations = this.conversations.filter((c) => c.id !== tabId);
    if (this.activeTabId === tabId) {
      const newIndex = Math.min(tabIndex, this.conversations.length - 1);
      this.activeTabId = this.conversations[newIndex].id;
    }
    this.persistConversations();
  }

  resetConversation() {
    const conv = this.activeConversation;
    if (conv) {
      conv.messages = [];
      this.conversations = [...this.conversations];
    }
    this.reasoningText = '';
    this.streamingResponse = '';
    this.toolsUsed = [];
    this.persistConversations();
  }

  stopRequest() {
    console.log('[DA-AI] Stop button clicked');
    if (this.currentAbortController) {
      console.log('[DA-AI] Aborting request...');
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    // Immediately update UI
    this.isThinking = false;
    this.reasoningText = 'Stopped';
    this.streamingResponse = '';
  }

  toggleToolsPanel() {
    this.showToolsPanel = !this.showToolsPanel;
  }

  togglePromptsModal() {
    this.showPromptsModal = !this.showPromptsModal;
  }

  toggleTool(toolId) {
    this.enabledTools = { ...this.enabledTools, [toolId]: !this.enabledTools[toolId] };
  }

  selectPrompt(prompt) {
    this.inputValue = prompt;
    this.showPromptsModal = false;
    this.updateComplete.then(() => {
      this.shadowRoot?.querySelector('.input-field')?.focus();
    });
  }

  toggleReasoning() {
    this.reasoningExpanded = !this.reasoningExpanded;
  }

  handleInputChange(e) {
    this.inputValue = e.target.value;
  }

  handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  async handleFileUpload(e) {
    const input = e.target;
    const files = Array.from(input?.files || []);
    console.log('[DA-AI] File upload triggered, files:', files.length);
    
    const context = parsePageContext();
    
    for (const file of files) {
      console.log('[DA-AI] Processing file:', file.name, file.type, file.size);
      if (file.type.startsWith('image/')) {
        try {
          // Compress image
          const compressed = await compressImage(file);
          console.log('[DA-AI] Image compressed, uploading to DA...');
          
          // Upload immediately to da-admin
          const uploadResult = await uploadImageToDA(
            compressed.blob,
            compressed.name,
            context,
            this.imsToken
          );
          
          // Store only the reference, not the blob
          // url is the contentUrl which is publicly accessible
          this.uploadedFiles = [...this.uploadedFiles, {
            name: compressed.name,
            type: compressed.type,
            uploaded: true,
            path: uploadResult.path,
            url: uploadResult.url, // contentUrl - publicly accessible
            fullPath: uploadResult.fullPath,
            contentUrl: uploadResult.contentUrl,
          }];
          console.log('[DA-AI] Image uploaded:', uploadResult.path, 'URL:', uploadResult.url);
        } catch (err) {
          console.error('[DA-AI] Image upload failed:', err);
          // Fallback: show error to user
          this.uploadedFiles = [...this.uploadedFiles, {
            name: file.name,
            type: file.type,
            error: err.message,
          }];
        }
      } else {
        // Read text files as-is
        const reader = new FileReader();
        reader.onload = (event) => {
          this.uploadedFiles = [...this.uploadedFiles, {
            name: file.name,
            type: file.type,
            content: event.target?.result,
          }];
        };
        reader.readAsText(file);
      }
    }
    console.log('[DA-AI] Total uploadedFiles:', this.uploadedFiles.length);
    if (input) input.value = '';
  }

  removeFile(index) {
    this.uploadedFiles = this.uploadedFiles.filter((_, i) => i !== index);
  }

  copyMessage(content) {
    navigator.clipboard.writeText(content);
  }

  likeMessage(index) {
    // TODO: Implement feedback API call
    console.log('Liked message:', index);
  }

  dislikeMessage(index) {
    // TODO: Implement feedback API call
    console.log('Disliked message:', index);
  }

  async sendMessage() {
    const content = this.inputValue.trim();
    if (!content || this.isThinking) return;

    const conv = this.activeConversation;
    if (conv.messages.length === 0) {
      conv.name = content.slice(0, 20) + (content.length > 20 ? '...' : '');
      this.conversations = [...this.conversations];
    }

    conv.messages = [...conv.messages, { type: 'user', content }];
    this.conversations = [...this.conversations];

    this.inputValue = '';
    this.isThinking = true;
    this.reasoningText = 'Thinking...';
    this.streamingResponse = '';
    this.toolsUsed = [];
    
    // Create abort controller for this request
    this.currentAbortController = new AbortController();

    try {
      const context = parsePageContext();
      const enabledToolNames = Object.entries(this.enabledTools).filter(([, enabled]) => enabled).map(([id]) => id);

      const response = await fetch(`${CHAT_API_URL}/api/chat/stream`, {
        signal: this.currentAbortController.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          conversationHistory: conv.messages.slice(-10).map((m) => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.content })),
          imsToken: this.imsToken,
          enabledTools: enabledToolNames,
          attachments: (() => {
            const atts = this.uploadedFiles.map((f) => ({
              name: f.name,
              type: f.type,
              uploaded: f.uploaded || false,
              path: f.path,
              url: f.url, // contentUrl for public access
              fullPath: f.fullPath,
              contentUrl: f.contentUrl,
              content: f.content, // Only for text files
              error: f.error,
            }));
            console.log('[DA-AI] Sending attachments:', atts.length, atts.map(a => ({ name: a.name, uploaded: a.uploaded, path: a.path, url: a.url })));
            return atts;
          })(),
          pageContext: { org: context.org, project: context.project, page: context.page, sourcePath: `${context.org}/${context.project}/${context.page}` },
        }),
      });

      this.uploadedFiles = [];
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                switch (data.type) {
                  case 'reasoning': this.reasoningText = data.text || 'Thinking...'; break;
                  case 'tool_use': this.toolsUsed = [...this.toolsUsed, data.tool]; this.reasoningText = `Using ${data.tool}...`; break;
                  case 'text': fullResponse += data.text; this.streamingResponse = fullResponse; break;
                  case 'complete':
                    this.isThinking = false;
                    if (!fullResponse && data.finalText) fullResponse = data.finalText;
                    if (data.toolsUsed?.length > 0) this.toolsUsed = data.toolsUsed;
                    this.reasoningText = this.toolsUsed.length > 0 ? `Used: ${this.toolsUsed.join(', ')}` : 'Complete';
                    break;
                  case 'error': throw new Error(data.message);
                  default: break;
                }
              } catch (parseError) { /* ignore */ }
            }
          }
        }
      }

      if (fullResponse) {
        conv.messages = [...conv.messages, { type: 'assistant', content: fullResponse }];
        this.conversations = [...this.conversations];
        this.persistConversations();
      }
      this.streamingResponse = '';
    } catch (error) {
      this.isThinking = false;
      this.currentAbortController = null;
      if (error.name === 'AbortError') {
        this.reasoningText = 'Stopped';
        conv.messages = [...conv.messages, { type: 'assistant', content: 'Request was cancelled.' }];
      } else {
        this.reasoningText = 'Error';
        conv.messages = [...conv.messages, { type: 'assistant', content: `Sorry, I encountered an error: ${error.message}` }];
      }
      this.conversations = [...this.conversations];
      this.persistConversations();
    }

    this.updateComplete.then(() => {
      const el = this.shadowRoot?.querySelector('.messages-container');
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  renderTriggerButton() {
    return html`
      <button class="trigger-btn ${this.isOpen ? 'active' : ''}" @click=${this.toggleAssistant} title="AI Assistant">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
    `;
  }

  renderTabs() {
    return html`
      <div class="tabs-bar">
        <div class="tabs-scroll">
          ${this.conversations.map((conv) => html`
            <button class="tab ${conv.id === this.activeTabId ? 'active' : ''}" @click=${() => this.switchTab(conv.id)}>
              <span class="tab-name">${conv.name}</span>
              ${this.conversations.length > 1 ? html`<span class="tab-close" @click=${(e) => this.closeTab(conv.id, e)}>×</span>` : nothing}
            </button>
          `)}
          <button class="tab-add" @click=${this.addNewTab} title="New chat">+</button>
        </div>
        <button class="reset-btn" @click=${this.resetConversation} title="Reset">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
      </div>
    `;
  }

  renderMessages() {
    const context = parsePageContext();
    const msgs = this.messages;

    if (msgs.length === 0 && !this.streamingResponse) {
      return html`
        <div class="empty-state">
          <p class="empty-title">How can I help you today?</p>
          <p class="empty-context">${context.org}/${context.project}/${context.page}</p>
        </div>
      `;
    }

    return html`
      ${msgs.map((msg, idx) => html`
        <div class="message ${msg.type}">
          <div class="message-content">${msg.content}</div>
          ${msg.type === 'assistant' ? html`
            <div class="message-actions">
              <button class="action-btn" @click=${() => this.likeMessage(idx)} title="Like">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
              </button>
              <button class="action-btn" @click=${() => this.dislikeMessage(idx)} title="Dislike">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
              </button>
              <button class="action-btn" @click=${() => this.copyMessage(msg.content)} title="Copy">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          ` : nothing}
        </div>
      `)}
      ${this.streamingResponse ? html`<div class="message assistant"><div class="message-content">${this.streamingResponse}</div></div>` : nothing}
    `;
  }

  renderReasoningPanel() {
    if (!this.reasoningText && !this.isThinking && this.toolsUsed.length === 0) return nothing;
    return html`
      <div class="reasoning-panel ${this.isThinking ? 'thinking' : ''}">
        <span class="reasoning-status">${this.isThinking ? '◐' : '✓'}</span>
        <span class="reasoning-text">${this.reasoningText || 'Processing...'}</span>
        ${this.toolsUsed.length > 0 ? html`
          <div class="tools-used">
            ${this.toolsUsed.map((tool) => html`<span class="tool-badge">${tool}</span>`)}
          </div>
        ` : nothing}
      </div>
    `;
  }

  renderToolsPanel() {
    if (!this.showToolsPanel) return nothing;
    return html`
      <div class="tools-panel">
        <div class="panel-header">ENABLE/DISABLE TOOLS</div>
        ${AVAILABLE_TOOLS.map((tool) => html`
          <label class="tool-row">
            <input type="checkbox" .checked=${this.enabledTools[tool.id]} @change=${() => this.toggleTool(tool.id)} />
            <span class="tool-name">${tool.name}</span>
          </label>
        `)}
      </div>
    `;
  }

  renderPromptsModal() {
    if (!this.showPromptsModal) return nothing;
    return html`
      <div class="modal-overlay" @click=${this.togglePromptsModal}>
        <div class="modal-content" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h2>Prompt Library</h2>
            <button class="modal-close" @click=${this.togglePromptsModal}>×</button>
          </div>
          <div class="modal-body">
            <p class="modal-subtitle">Suggested prompts</p>
            <div class="prompts-grid">
              ${PROMPT_LIBRARY.map((item) => html`
                <button class="prompt-card" @click=${() => this.selectPrompt(item.prompt)}>
                  <h3 class="prompt-title">${item.title}</h3>
                  <p class="prompt-desc">${item.description}</p>
                  <div class="prompt-tags">${item.tags.map((tag) => html`<span class="tag">${tag}</span>`)}</div>
                </button>
              `)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderFileChips() {
    if (this.uploadedFiles.length === 0) return nothing;
    return html`
      <div class="file-chips">
        ${this.uploadedFiles.map((file, idx) => html`
          <span class="file-chip">${file.name}<button class="chip-remove" @click=${() => this.removeFile(idx)}>×</button></span>
        `)}
      </div>
    `;
  }

  renderFooter() {
    return html`
      <div class="footer">
        <div class="footer-left">
          <button class="footer-btn ${this.showToolsPanel ? 'active' : ''}" @click=${this.toggleToolsPanel} title="Tools">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            <span>Tools</span>
          </button>
          <label class="footer-btn" title="Attach">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            <input type="file" multiple accept=".txt,.md,.html,.json,.xml,.csv,image/*" @change=${this.handleFileUpload} style="display:none" />
          </label>
        </div>
        <div class="footer-right">
          <button class="footer-btn" @click=${this.togglePromptsModal} title="Prompts">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <span>Prompts</span>
          </button>
        </div>
      </div>
      <div class="disclaimer">AI Assistant is powered by Adobe Experience Platform. Please verify all generated responses.</div>
    `;
  }

  renderPanel() {
    if (!this.isOpen) return nothing;
    return html`
      <div class="panel-overlay" @click=${this.toggleAssistant}></div>
      <div class="panel">
        ${this.renderTabs()}
        <div class="messages-container">${this.renderMessages()}</div>
        ${this.renderReasoningPanel()}
        ${this.renderToolsPanel()}
        ${this.renderFileChips()}
        <div class="input-container">
          <input class="input-field" type="text" placeholder="Ask me anything..." .value=${this.inputValue} @input=${this.handleInputChange} @keydown=${this.handleKeyDown} ?disabled=${this.isThinking} />
          ${this.isThinking
            ? html`<button class="stop-btn" @click=${this.stopRequest} title="Stop request">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>
              </button>`
            : html`<button class="send-btn" @click=${this.sendMessage} ?disabled=${!this.inputValue.trim()}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>`
          }
        </div>
        ${this.renderFooter()}
      </div>
      ${this.renderPromptsModal()}
    `;
  }

  render() {
    return html`
      <div class="da-ai-assistant">
        ${this.renderTriggerButton()}
        ${this.renderPanel()}
      </div>
    `;
  }
}

customElements.define('da-ai-assistant', DaAiAssistant);

export default function init(el) {
  const assistant = document.createElement('da-ai-assistant');
  el.append(assistant);
  return assistant;
}

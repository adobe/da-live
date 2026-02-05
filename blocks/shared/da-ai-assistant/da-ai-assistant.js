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
import { initIms, daFetch } from '../../shared/utils.js';
import getSheet from '../../shared/sheet.js';

/**
 * Environment-aware configuration
 * Automatically detects local development vs production
 */
const IS_LOCAL_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const ENV_CONFIG = {
  // Chat API server (Node.js backend for LLM interaction)
  CHAT_API_URL: IS_LOCAL_DEV
    ? 'http://localhost:3007'
    : 'https://chat-api.da.live', // TODO: Update with production URL when deployed

  // DA Admin API (proxy to R2 storage)
  DA_ADMIN_URL: IS_LOCAL_DEV
    ? 'http://localhost:8787'
    : 'https://admin.da.live',

  // Content CDN (public image delivery)
  CONTENT_CDN_URL: IS_LOCAL_DEV
    ? 'http://localhost:8787/source' // Local dev uses da-admin with auth
    : 'https://content.da.live',
};

const CHAT_API_URL = ENV_CONFIG.CHAT_API_URL;
const DA_ADMIN_URL = ENV_CONFIG.DA_ADMIN_URL;
const CONTENT_CDN_URL = ENV_CONFIG.CONTENT_CDN_URL;

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
  const url = `${DA_ADMIN_URL}/source/${org}/${project}/${hiddenPath}`;
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
  let imageUrl = contentUrl;
  
  if (!imageUrl || (IS_LOCAL_DEV && imageUrl.includes('content.da.live'))) {
    // Local dev: use /source/ path - da-admin serves with auth
    // Production: use content.da.live CDN
    imageUrl = IS_LOCAL_DEV 
      ? `/source/${org}/${project}/${hiddenPath}`
      : `${CONTENT_CDN_URL}/${org}/${project}/${hiddenPath}`;
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
    inputHistory: { type: Array, state: true }, // Last 3 sent messages
    historyIndex: { type: Number, state: true }, // Current position in history (-1 = new message)
    isThinking: { type: Boolean, state: true },
    reasoningText: { type: String, state: true },
    reasoningExpanded: { type: Boolean, state: true },
    streamingResponse: { type: String, state: true },
    showToolsPanel: { type: Boolean, state: true },
    showPromptsModal: { type: Boolean, state: true },
    showConfirmModal: { type: Boolean, state: true },
    confirmModalAction: { type: String, state: true },
    enabledTools: { type: Object, state: true },
    uploadedFiles: { type: Array, state: true },
    toolsUsed: { type: Array, state: true },
    isListening: { type: Boolean, state: true },
    // Asset browser state
    showMediaPanel: { type: Boolean, state: true },
    showBriefsPanel: { type: Boolean, state: true },
    mediaFiles: { type: Array, state: true },
    briefs: { type: Array, state: true },
    isLoadingAssets: { type: Boolean, state: true },
    selectedAssets: { type: Array, state: true },
    mediaLoaded: { type: Boolean, state: true },
    uploadProgress: { type: Number, state: true },
    isDraggingBrief: { type: Boolean, state: true },
    // Preview panel state
    showPreview: { type: Boolean, state: true },
    originalContent: { type: String, state: true },
    proposedContent: { type: String, state: true },
    previewAnimating: { type: Boolean, state: true },
    pendingChange: { type: Object, state: true },
  };

  constructor() {
    super();
    this.isOpen = false;
    this.conversations = [{ id: 1, name: 'Chat 1', messages: [] }];
    this.activeTabId = 1;
    this.inputValue = '';
    this.inputHistory = []; // Last 3 sent messages
    this.historyIndex = -1; // -1 means not browsing history
    this.isThinking = false;
    this.reasoningText = '';
    this.reasoningExpanded = false;
    this.streamingResponse = '';
    this.imsToken = null;
    this.showToolsPanel = false;
    this.showPromptsModal = false;
    this.showConfirmModal = false;
    this.confirmModalAction = null; // 'reset' or { type: 'close', tabId: id }
    this.uploadedFiles = [];
    this.toolsUsed = [];
    this.nextTabId = 2;
    this.currentAbortController = null;
    this.isListening = false;
    this.speechRecognition = null;
    // Asset browser state
    this.showMediaPanel = false;
    this.showBriefsPanel = false;
    this.mediaFiles = [];
    this.briefs = []; // Uploaded docx/pdf briefs
    this.isLoadingAssets = false;
    this.selectedAssets = []; // Selected media files as pills
    this.mediaLoaded = false;
    this.isDraggingBrief = false;
    this.uploadProgress = 0;
    // Preview panel state
    this.showPreview = false;
    this.originalContent = '';       // The BASELINE content from database (never changes during session)
    this.proposedContent = '';       // The CUMULATIVE proposed content (updated with each AI change)
    this.previewAnimating = false;
    this.pendingChange = null;
    this._baselineContent = '';      // Original content from DB before ANY AI changes
    this._allChanges = [];           // Accumulated list of all changes with unique IDs
    this._changeIdCounter = 0;       // Counter for unique change IDs

    this.enabledTools = {};
    AVAILABLE_TOOLS.forEach((tool) => {
      this.enabledTools[tool.id] = tool.enabled;
    });

    // Initialize Speech Recognition if available
    this.initSpeechRecognition();
  }

  updated(changedProperties) {
    super.updated?.(changedProperties);
    
    // Re-populate preview content when panel reopens or showPreview changes
    if (changedProperties.has('isOpen') || changedProperties.has('showPreview')) {
      if (this.isOpen && this.showPreview && this.proposedContent && !this.previewAnimating) {
        // Content was already animated - just show it directly with highlights
        requestAnimationFrame(() => {
          const container = this.shadowRoot?.querySelector('#preview-animated');
          if (container && !container.innerHTML) {
            container.innerHTML = this.proposedContent;
            this.updatePreviewHighlights();
          }
        });
      }
    }
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[DA-AI] Speech Recognition not supported in this browser');
      return;
    }

    this.speechRecognition = new SpeechRecognition();
    this.speechRecognition.continuous = true; // Keep listening until manually stopped
    this.speechRecognition.interimResults = true;
    // Don't set lang - let browser use system default (more compatible)
    // this.speechRecognition.lang = 'en-US';
    this.wantsToListen = false; // Track user intent
    this._silenceTimeout = null;
    this._lastSpeechTime = null;
    const SILENCE_TIMEOUT_MS = 10000; // 10 seconds of silence

    this.speechRecognition.onstart = () => {
      console.log('[DA-AI] Speech recognition started');
      this.isListening = true;
      this._lastSpeechTime = Date.now();
      this._startSilenceTimer(SILENCE_TIMEOUT_MS);
    };

    this.speechRecognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Reset silence timer on any speech
      this._lastSpeechTime = Date.now();
      this._startSilenceTimer(SILENCE_TIMEOUT_MS);

      // Update input with final transcript, appending to existing
      if (finalTranscript) {
        // Add space if there's existing content
        const prefix = this.inputValue && !this.inputValue.endsWith(' ') ? ' ' : '';
        this.inputValue = this.inputValue + prefix + finalTranscript;
      }
      
      // Store interim for display but don't permanently add it
      this._interimTranscript = interimTranscript;
      this.requestUpdate();
    };

    this.speechRecognition.onend = () => {
      console.log('[DA-AI] Speech recognition ended, wantsToListen:', this.wantsToListen);
      this._clearSilenceTimer();
      // If user still wants to listen (didn't click stop), restart
      if (this.wantsToListen) {
        console.log('[DA-AI] Restarting speech recognition...');
        try {
          this.speechRecognition.start();
        } catch (e) {
          console.warn('[DA-AI] Could not restart:', e);
          this.isListening = false;
          this.wantsToListen = false;
        }
      } else {
        this.isListening = false;
      }
      this._interimTranscript = '';
    };

    this.speechRecognition.onerror = (event) => {
      console.error('[DA-AI] Speech recognition error:', event.error);
      // Don't stop on no-speech error, just keep listening
      if (event.error === 'no-speech') {
        console.log('[DA-AI] No speech detected, continuing...');
        return;
      }
      if (event.error === 'aborted') {
        // User stopped, that's fine
        return;
      }
      // For all other errors, stop completely to prevent loops
      this._clearSilenceTimer();
      this.isListening = false;
      this.wantsToListen = false;
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access to use voice input.');
      } else if (event.error === 'language-not-supported') {
        alert('Speech recognition language not supported. Please check your browser settings.');
      } else if (event.error === 'network') {
        alert('Network error during speech recognition. Please check your connection.');
      }
    };
  }

  _startSilenceTimer(timeout) {
    this._clearSilenceTimer();
    this._silenceTimeout = setTimeout(() => {
      console.log('[DA-AI] Silence timeout - stopping mic');
      this.stopListening();
    }, timeout);
  }

  _clearSilenceTimer() {
    if (this._silenceTimeout) {
      clearTimeout(this._silenceTimeout);
      this._silenceTimeout = null;
    }
  }

  stopListening() {
    if (this.speechRecognition && this.isListening) {
      console.log('[DA-AI] Stopping listening');
      this.wantsToListen = false;
      this._clearSilenceTimer();
      this.speechRecognition.stop();
    }
  }

  toggleListening() {
    if (!this.speechRecognition) {
      alert('Speech recognition is not supported in your browser. Try Chrome or Edge.');
      return;
    }

    if (this.isListening) {
      this.stopListening();
    } else {
      console.log('[DA-AI] User starting listening');
      this.wantsToListen = true;
      this._interimTranscript = '';
      try {
        this.speechRecognition.start();
      } catch (e) {
        console.error('[DA-AI] Could not start:', e);
        // Might already be running, try to stop and restart
        this.speechRecognition.stop();
      }
    }
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
      // Get user profile for AI attribution
      if (window.adobeIMS?.isSignedInUser()) {
        const profile = await window.adobeIMS.getProfile();
        this.userName = profile?.displayName || profile?.email || 'Unknown User';
        this.userId = profile?.userId;
        console.log('[DA-AI] User profile loaded:', this.userName);
      }
    } catch (e) {
      console.warn('[DA-AI] Could not load IMS token:', e);
    }
  }

  toggleAssistant() {
    this.isOpen = !this.isOpen;
    this.showToolsPanel = false;
    this.showPromptsModal = false;
    // Stop listening when closing the panel
    if (!this.isOpen) {
      this.stopListening();
    } else {
      // Preload media assets when opening the panel
      if (!this.mediaLoaded) this.loadMediaFiles();
    }
  }

  // Tab management
  switchTab(tabId) {
    if (tabId !== this.activeTabId) {
      console.log('[DA-AI] Switching to tab:', tabId);
      this.activeTabId = tabId;
      this.reasoningText = '';
      this.streamingResponse = '';
      this.toolsUsed = [];
      // Force update by reassigning conversations (triggers reactivity)
      this.conversations = [...this.conversations];
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
    this.toolsUsed = [];
    this.persistConversations();
  }

  closeTab(tabId, e) {
    e.stopPropagation();
    if (this.conversations.length <= 1) return;
    
    // Check if tab has messages - show confirmation
    const tab = this.conversations.find((c) => c.id === tabId);
    if (tab && tab.messages.length > 0) {
      this.confirmModalAction = { type: 'close', tabId };
      this.showConfirmModal = true;
      return;
    }
    
    this.doCloseTab(tabId);
  }

  doCloseTab(tabId) {
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
    // Show confirmation if there are messages
    if (conv && conv.messages.length > 0) {
      this.confirmModalAction = 'reset';
      this.showConfirmModal = true;
      return;
    }
    this.doResetConversation();
  }

  doResetConversation() {
    const conv = this.activeConversation;
    if (conv) {
      conv.messages = [];
      conv.name = `Chat ${conv.id}`; // Reset the tab name too
      this.conversations = [...this.conversations];
    }
    this.reasoningText = '';
    this.streamingResponse = '';
    this.toolsUsed = [];
    this.uploadedFiles = [];
    this._interimTranscript = '';
    this.persistConversations();
  }

  confirmModalYes() {
    this.showConfirmModal = false;
    if (this.confirmModalAction === 'reset') {
      this.doResetConversation();
    } else if (this.confirmModalAction?.type === 'close') {
      this.doCloseTab(this.confirmModalAction.tabId);
    }
    this.confirmModalAction = null;
  }

  confirmModalNo() {
    this.showConfirmModal = false;
    this.confirmModalAction = null;
  }

  // Preview Panel Methods
  async showProposedChange(originalHtml, proposedHtml, changeInfo) {
    console.log('[DA-AI] Showing preview panel - side by side with editor');
    
    // First time seeing a change? Store the baseline from DB
    if (!this._baselineContent) {
      this._baselineContent = originalHtml;
      this.originalContent = originalHtml;
    }
    
    // Detect NEW changes by comparing previous proposed with new proposed
    const previousProposed = this.proposedContent || this._baselineContent;
    const newChanges = this.detectNewChanges(previousProposed, proposedHtml);
    
    // Add new changes to the accumulated list with unique IDs
    newChanges.forEach(change => {
      change.id = `change-${++this._changeIdCounter}`;
      change.rejected = false;
      this._allChanges.push(change);
    });
    
    console.log('[DA-AI] New changes detected:', newChanges.length, 'Total changes:', this._allChanges.length);
    
    // Update the proposed content (cumulative)
    this.proposedContent = proposedHtml;
    this.pendingChange = changeInfo;
    this.showPreview = true;
    this.previewAnimating = true;

    // Shrink the editor to make room for preview
    this.resizeEditorForPreview(true);

    // Wait for render, then position preview panel to touch assistant panel
    await this.updateComplete;
    
    // Get actual width of assistant panel and position preview to touch it
    const assistantPanel = this.shadowRoot?.querySelector('.panel');
    const previewOverlay = this.shadowRoot?.querySelector('.preview-overlay');
    if (assistantPanel && previewOverlay) {
      const panelWidth = assistantPanel.getBoundingClientRect().width;
      previewOverlay.style.right = `${panelWidth}px`;
    }

    // Animate the proposed content in the side panel
    this.animatePreview(proposedHtml);
  }

  detectNewChanges(previousHtml, newHtml) {
    // Compare previous proposed content with new proposed to find NEW changes only
    const changes = [];
    const prevDiv = document.createElement('div');
    const newDiv = document.createElement('div');
    prevDiv.innerHTML = previousHtml || '';
    newDiv.innerHTML = newHtml || '';
    
    // Find new headings (not in previous)
    const prevHeadings = [...prevDiv.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(h => h.outerHTML);
    newDiv.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
      if (!prevHeadings.includes(heading.outerHTML)) {
        const text = heading.textContent?.slice(0, 25) || 'heading';
        changes.push({ 
          type: 'heading', 
          description: `Added ${heading.tagName}: "${text}${text.length > 25 ? '...' : ''}"`,
          elementHtml: heading.outerHTML
        });
      }
    });
    
    // Find new buttons
    const prevButtons = [...prevDiv.querySelectorAll('a.button, button, .button')].map(b => b.outerHTML);
    newDiv.querySelectorAll('a.button, button, .button').forEach(btn => {
      if (!prevButtons.includes(btn.outerHTML)) {
        const text = btn.textContent?.slice(0, 20) || 'button';
        changes.push({ 
          type: 'button', 
          description: `Added button: "${text}"`,
          elementHtml: btn.outerHTML
        });
      }
    });
    
    // Find new images
    const prevImages = [...prevDiv.querySelectorAll('img, picture')].map(i => i.outerHTML);
    newDiv.querySelectorAll('img, picture').forEach(img => {
      if (!prevImages.includes(img.outerHTML)) {
        const alt = img.alt || img.querySelector?.('img')?.alt || 'image';
        changes.push({ 
          type: 'media', 
          description: `Added image: ${alt.slice(0, 20)}`,
          elementHtml: img.outerHTML
        });
      }
    });
    
    // Find new paragraphs
    const prevParas = [...prevDiv.querySelectorAll('p')].map(p => p.textContent);
    newDiv.querySelectorAll('p').forEach(para => {
      if (!prevParas.includes(para.textContent)) {
        const text = para.textContent?.slice(0, 30) || 'paragraph';
        changes.push({ 
          type: 'text', 
          description: `Added: "${text}${text.length > 30 ? '...' : ''}"`,
          elementHtml: para.outerHTML
        });
      }
    });
    
    // Find removed headings
    const newHeadings = [...newDiv.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(h => h.outerHTML);
    prevDiv.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
      if (!newHeadings.includes(heading.outerHTML)) {
        const text = heading.textContent?.slice(0, 25) || 'heading';
        changes.push({ 
          type: 'remove', 
          description: `Removed ${heading.tagName}: "${text}"`,
          elementHtml: heading.outerHTML
        });
      }
    });
    
    return changes;
  }

  resizeEditorForPreview(showPreview) {
    // Find the da-content element and its shadow root
    const daContent = document.querySelector('da-content');
    if (daContent?.shadowRoot) {
      const editorWrapper = daContent.shadowRoot.querySelector('.editor-wrapper');
      if (editorWrapper) {
        if (showPreview) {
          editorWrapper.style.transition = 'all 0.3s ease-out';
          editorWrapper.style.maxWidth = 'calc(100vw - 1100px)'; // Room for preview (600px) + assistant (420px) + padding
          editorWrapper.style.marginRight = 'auto';
          editorWrapper.style.marginLeft = '20px';
        } else {
          editorWrapper.style.transition = 'all 0.3s ease-out';
          editorWrapper.style.maxWidth = '';
          editorWrapper.style.marginRight = '';
          editorWrapper.style.marginLeft = '';
        }
      }
    }

    // Also resize the da-title-inner
    const daTitle = document.querySelector('da-title');
    if (daTitle?.shadowRoot) {
      const titleInner = daTitle.shadowRoot.querySelector('.da-title-inner');
      if (titleInner) {
        if (showPreview) {
          titleInner.style.transition = '0.3s ease-out';
          titleInner.style.maxWidth = 'calc(100vw - 1100px)';
          titleInner.style.marginRight = 'auto';
          titleInner.style.marginLeft = '110px';
        } else {
          titleInner.style.transition = '0.3s ease-out';
          titleInner.style.maxWidth = '';
          titleInner.style.marginRight = '';
          titleInner.style.marginLeft = '';
        }
      }
    }
  }

  async animatePreview(html) {
    const container = this.shadowRoot?.querySelector('#preview-animated');
    if (!container) {
      this.previewAnimating = false;
      return;
    }

    // Parse the HTML to extract text content for animation
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const textContent = tempDiv.textContent || '';

    // Clear container
    container.innerHTML = '';

    // Create a wrapper that will receive the animated content
    const wrapper = document.createElement('div');
    wrapper.className = 'animated-content';
    container.appendChild(wrapper);

    // Animate typing effect - word by word for speed
    const words = textContent.split(/\s+/);
    let currentText = '';

    for (let i = 0; i < words.length; i++) {
      currentText += (i > 0 ? ' ' : '') + words[i];
      wrapper.textContent = currentText;

      // Add cursor at end
      const cursor = document.createElement('span');
      cursor.className = 'typing-cursor';
      cursor.textContent = '|';
      wrapper.appendChild(cursor);

      // Delay between words (faster for longer content)
      const delay = words.length > 50 ? 20 : 50;
      await new Promise((r) => setTimeout(r, delay));
    }

    // Animation complete - show full HTML with highlights
    container.innerHTML = html;
    this.previewAnimating = false;
    
    // Apply highlights to show what changed
    this.updatePreviewHighlights();
    this.requestUpdate();
  }

  async approvePreview() {
    if (!this.pendingChange) return;

    // Check if any changes were rejected - need to filter them out
    const rejectedChanges = this._allChanges?.filter(c => c.rejected) || [];
    const approvedChanges = this._allChanges?.filter(c => !c.rejected) || [];
    
    console.log('[DA-AI] Approving preview - approved:', approvedChanges.length, 'rejected:', rejectedChanges.length);
    
    // Build the final content by removing rejected elements
    let finalContent = this.proposedContent;
    if (rejectedChanges.length > 0) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = this.proposedContent;
      
      // Remove rejected elements from the content
      rejectedChanges.forEach(change => {
        if (change.elementHtml) {
          const el = this.findElementByHtml(tempDiv, change.elementHtml);
          if (el) {
            console.log('[DA-AI] Removing rejected element:', change.description);
            el.remove();
          }
        }
      });
      
      finalContent = tempDiv.innerHTML;
    }
    
    this.showPreview = false;
    this.resizeEditorForPreview(false);

    // Actually commit the change via MCP
    const { org, repo, path } = this.pendingChange;

    try {
      // Call the API to commit the change with filtered content
      const response = await fetch(`${CHAT_API_URL}/api/commit-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org,
          repo,
          path,
          content: finalContent,
          imsToken: this.imsToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`Commit failed: ${response.status}`);
      }

      console.log('[DA-AI] Change committed successfully');

      // Add success message to chat with details
      const msg = rejectedChanges.length > 0 
        ? `Applied ${approvedChanges.length} change(s). ${rejectedChanges.length} change(s) were discarded. Reloading...`
        : 'All changes applied successfully! Reloading...';
      this.addAssistantMessage(msg);
      
      // Reload the page to sync the editor with the updated S3 content
      // The editor uses Yjs which is separate from S3, so we need to reload
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('[DA-AI] Failed to commit change:', error);
      this.addAssistantMessage(`Failed to apply changes: ${error.message}`);
    }

    // Clear all state after commit
    this.pendingChange = null;
    this.originalContent = '';
    this.proposedContent = '';
    this._baselineContent = '';
    this._allChanges = [];
    this._changeIdCounter = 0;
  }

  rejectPreview() {
    console.log('[DA-AI] Rejecting all changes:', this._allChanges?.length || 0);
    this.showPreview = false;
    this.resizeEditorForPreview(false);
    this.pendingChange = null;
    this.originalContent = '';
    this.proposedContent = '';
    
    // Clear accumulated state
    this._baselineContent = '';
    this._allChanges = [];
    this._changeIdCounter = 0;

    // Add message to chat
    this.addAssistantMessage('All changes discarded. No modifications were made.');
  }

  addAssistantMessage(text) {
    const conv = this.conversations.find((c) => c.id === this.activeTabId);
    if (conv) {
      conv.messages.push({ type: 'assistant', content: text });
      this.conversations = [...this.conversations];
      this.persistConversations();
    }
  }

  async generateConversationSummary(conv, lastResponse) {
    // Create a short, engaging summary and title from the first exchange
    const userMessage = conv.messages.find((m) => m.type === 'user')?.content || '';
    const userMsgLower = userMessage.toLowerCase().trim();
    
    // Check if this is a generic greeting that doesn't deserve a title yet
    const genericGreetings = ['hello', 'hi', 'hey', 'hola', 'help', 'test', 'ok', 'thanks', 'thank you'];
    const isGenericGreeting = genericGreetings.some((g) => userMsgLower === g || userMsgLower.startsWith(`${g} `));
    
    // Generate title based on user's intent
    let title = conv.title || conv.name;
    let summary = '';
    
    if (!isGenericGreeting && userMessage.length > 5) {
      // Extract action-based title
      if (userMsgLower.includes('add')) {
        title = 'Adding Content';
      } else if (userMsgLower.includes('change') || userMsgLower.includes('update') || userMsgLower.includes('modify')) {
        title = 'Content Updates';
      } else if (userMsgLower.includes('remove') || userMsgLower.includes('delete')) {
        title = 'Removing Content';
      } else if (userMsgLower.includes('create') || userMsgLower.includes('write')) {
        title = 'Creating Content';
      } else if (userMsgLower.includes('image') || userMsgLower.includes('photo') || userMsgLower.includes('picture')) {
        title = 'Image Work';
      } else if (userMsgLower.includes('format') || userMsgLower.includes('style')) {
        title = 'Formatting';
      } else if (userMsgLower.includes('heading') || userMsgLower.includes('h1') || userMsgLower.includes('h2')) {
        title = 'Heading Updates';
      } else if (userMsgLower.includes('link')) {
        title = 'Link Updates';
      } else if (userMsgLower.includes('list')) {
        title = 'List Updates';
      } else if (userMsgLower.includes('table')) {
        title = 'Table Work';
      } else if (userMessage.length > 20) {
        // Use first few words as title
        const words = userMessage.split(' ').slice(0, 4).join(' ');
        title = words.length > 25 ? words.substring(0, 25) + '...' : words;
      }
    }
    
    // Generate summary - first sentence of response or action description
    if (lastResponse.length < 60) {
      summary = lastResponse;
    } else {
      const firstSentence = lastResponse.split(/[.!?]/)[0];
      if (firstSentence && firstSentence.length > 10 && firstSentence.length < 80) {
        summary = firstSentence + '...';
      } else {
        summary = 'Working on your document';
      }
    }
    
    // Only update title if it's meaningful (not a generic greeting)
    if (!isGenericGreeting && title !== conv.name) {
      conv.title = title;
    }
    conv.summary = summary;
    conv.lastActivity = Date.now(); // Track last activity
    this.conversations = [...this.conversations];
    this.persistConversations();
    this.requestUpdate();
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

  // Asset Browser Methods
  async toggleMediaPanel() {
    this.showMediaPanel = !this.showMediaPanel;
    if (this.showMediaPanel && this.mediaFiles.length === 0) {
      await this.loadMediaFiles();
    }
  }

  toggleBriefsPanel() {
    this.showBriefsPanel = !this.showBriefsPanel;
  }

  handleBriefDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    this.isDraggingBrief = true;
  }

  handleBriefDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    this.isDraggingBrief = false;
  }

  async handleBriefDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.isDraggingBrief = false;
    
    const files = Array.from(e.dataTransfer?.files || []);
    await this.processBriefFiles(files);
  }

  async handleBriefUpload(e) {
    const files = Array.from(e.target?.files || []);
    await this.processBriefFiles(files);
    if (e.target) e.target.value = '';
  }

  async processBriefFiles(files) {
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    const SUPPORTED_FORMATS = ['.docx', '.doc', '.pdf', '.txt', '.md'];
    
    for (const file of files) {
      const name = file.name;
      const type = file.type;
      const ext = name.toLowerCase().substring(name.lastIndexOf('.'));
      
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        this.reasoningText = `Error: File too large - ${name} exceeds 50MB limit`;
        console.warn('[DA-AI] File too large:', name, file.size);
        continue;
      }
      
      // Accept docx, pdf, txt, md
      if (!SUPPORTED_FORMATS.includes(ext) && 
          !type.includes('word') && 
          !type.includes('pdf') && 
          !type.includes('text')) {
        this.reasoningText = `Error: Unsupported format - ${ext} files not supported`;
        console.warn('[DA-AI] Unsupported brief type:', name, type);
        continue;
      }
      
      console.log('[DA-AI] Processing brief:', name, type);
      this.uploadProgress = 0;
      
      try {
        let content = '';
        
        // Simulate progress for UX
        this.uploadProgress = 30;
        
        // Extract text content based on file type
        if (type.includes('text') || /\.(txt|md)$/i.test(name)) {
          // Plain text - read directly on client
          content = await file.text();
          this.uploadProgress = 100;
          this.briefs = [...this.briefs, { name, type, content, size: file.size }];
          console.log('[DA-AI] Brief added (text):', name, 'content length:', content.length);
        } else {
          // Binary files (docx, pdf) - send to server for parsing
          this.uploadProgress = 50;
          const base64 = await this.fileToBase64(file);
          this.uploadProgress = 70;
          const parsed = await this.parseBriefOnServer(name, type, base64);
          this.uploadProgress = 100;
          
          this.briefs = [...this.briefs, {
            name,
            type,
            content: parsed.content || `[Failed to parse ${name}]`,
            size: file.size,
          }];
          console.log('[DA-AI] Brief added (parsed):', name, 'content length:', parsed.content?.length);
        }
        
        // Clear progress after short delay
        setTimeout(() => { this.uploadProgress = 0; }, 500);
        
      } catch (err) {
        console.error('[DA-AI] Failed to process brief:', err);
        this.reasoningText = `Error: Failed to process ${name}`;
        this.uploadProgress = 0;
        this.briefs = [...this.briefs, {
          name,
          type,
          content: `[Failed to extract content from ${name}: ${err.message}]`,
          error: err.message,
        }];
      }
    }
  }

  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]; // Remove data URL prefix
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async parseBriefOnServer(name, type, base64) {
    try {
      const response = await fetch(`${CHAT_API_URL}/api/parse-brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, base64 }),
      });
      
      if (!response.ok) {
        throw new Error(`Parse failed: ${response.status}`);
      }
      
      return await response.json();
    } catch (err) {
      console.error('[DA-AI] Server parse failed:', err);
      return { content: `[Server parsing failed for ${name}]` };
    }
  }

  removeBrief(index) {
    this.briefs = this.briefs.filter((_, i) => i !== index);
  }


  async loadMediaFiles() {
    const context = parsePageContext();
    if (!context.org || !context.project) return;

    // Ensure IMS token is loaded
    if (!this.imsToken) {
      await this.loadImsToken();
    }
    
    if (!this.imsToken) {
      console.warn('[DA-AI] No IMS token available for media listing');
      return;
    }

    this.isLoadingAssets = true;
    console.log('[DA-AI] Loading media files for:', context.org, context.project);
    
    try {
      // List both media/ folder AND hidden folder .{page}/ for uploaded images
      const pageName = context.page || 'index';
      const paths = ['media', `.${pageName}`];
      
      const allFiles = [];
      
      for (const path of paths) {
        try {
          const response = await fetch(`${CHAT_API_URL}/api/list-assets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              org: context.org,
              repo: context.project,
              path,
              imsToken: this.imsToken,
            }),
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log(`[DA-AI] List assets (${path}) response:`, data.files?.length || 0);
            // Filter for image files
            const images = (data.files || []).filter((f) => {
              const checkPath = f.path || f.name || '';
              return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(checkPath);
            });
            allFiles.push(...images);
          }
        } catch (err) {
          console.warn(`[DA-AI] Failed to list ${path}:`, err);
        }
      }
      
      // Remove duplicates based on path
      const uniqueFiles = allFiles.filter((file, index, self) => 
        index === self.findIndex((f) => f.path === file.path)
      );
      
      this.mediaFiles = uniqueFiles;
      console.log('[DA-AI] Loaded media files (total):', this.mediaFiles.length);
    } catch (err) {
      console.error('[DA-AI] Failed to load media files:', err);
    } finally {
      this.isLoadingAssets = false;
      this.mediaLoaded = true;
    }
  }


  getThumbnailUrl(file) {
    // Return cached blob URL if available
    if (file._blobUrl) return file._blobUrl;
    
    const filePath = file.path || file.name;
    
    // Path from API already includes /org/repo/path, so just prepend the base
    // Remove leading slash if present to avoid double slashes
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    
    if (IS_LOCAL_DEV) {
      return `${DA_ADMIN_URL}/source/${cleanPath}`;
    }
    return `${CONTENT_CDN_URL}/${cleanPath}`;
  }

  async loadThumbnailAuth(file, imgElement) {
    if (!IS_LOCAL_DEV) return; // Production uses public CDN, no auth needed
    
    const filePath = file.path || file.name;
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const url = `${DA_ADMIN_URL}/source/${cleanPath}`;
    
    try {
      const response = await daFetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        file._blobUrl = blobUrl; // Cache it
        imgElement.src = blobUrl;
      } else {
        imgElement.classList.add('error');
      }
    } catch (err) {
      console.error('[DA-AI] Failed to load thumbnail:', err);
      imgElement.classList.add('error');
    }
  }

  selectAsset(file) {
    const filePath = file.path || file.name;
    
    // Toggle selection
    const existingIndex = this.selectedAssets.findIndex((f) => (f.path || f.name) === filePath);
    if (existingIndex >= 0) {
      // Remove if already selected
      this.selectedAssets = this.selectedAssets.filter((_, i) => i !== existingIndex);
    } else {
      // Add to selection
      this.selectedAssets = [...this.selectedAssets, file];
    }
    
    // Focus the input
    this.updateComplete.then(() => {
      this.shadowRoot?.querySelector('.input-field')?.focus();
    });
  }

  removeSelectedAsset(file) {
    const filePath = file.path || file.name;
    this.selectedAssets = this.selectedAssets.filter((f) => (f.path || f.name) !== filePath);
  }

  removeBrief(briefOrIndex) {
    if (typeof briefOrIndex === 'number') {
      // Remove by index
      this.briefs = this.briefs.filter((_, i) => i !== briefOrIndex);
    } else {
      // Remove by brief object
      this.briefs = this.briefs.filter((b) => b.name !== briefOrIndex.name);
    }
  }

  renderAttachmentPills() {
    const hasAttachments = this.selectedAssets.length > 0 || this.briefs.length > 0;
    const showProgress = this.uploadProgress > 0 && this.uploadProgress < 100;
    
    if (!hasAttachments && !showProgress) return nothing;
    
    return html`
      <div class="attachment-pills">
        ${showProgress ? html`
          <div class="upload-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${this.uploadProgress}%"></div>
            </div>
            <span class="progress-text">Processing... ${this.uploadProgress}%</span>
          </div>
        ` : nothing}
        ${this.selectedAssets.map((file) => {
          const name = file.name || file.path?.split('/').pop() || 'image';
          const truncated = name.length > 20 ? name.substring(0, 17) + '...' : name;
          return html`
            <span class="attachment-pill media">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
              <span class="pill-name">${truncated}</span>
              <button class="pill-close" @click=${() => this.removeSelectedAsset(file)}>×</button>
            </span>
          `;
        })}
        ${this.briefs.map((brief) => {
          const truncated = brief.name.length > 20 ? brief.name.substring(0, 17) + '...' : brief.name;
          return html`
            <span class="attachment-pill brief">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span class="pill-name">${truncated}</span>
              <button class="pill-close" @click=${() => this.removeBrief(brief)}>×</button>
            </span>
          `;
        })}
      </div>
    `;
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
    } else if (e.key === 'ArrowUp') {
      // Navigate to previous message in history
      if (this.inputHistory.length > 0) {
        e.preventDefault();
        if (this.historyIndex === -1) {
          // Save current input before navigating
          this._savedInput = this.inputValue;
          this.historyIndex = 0;
        } else if (this.historyIndex < this.inputHistory.length - 1) {
          this.historyIndex++;
        }
        this.inputValue = this.inputHistory[this.historyIndex] || '';
      }
    } else if (e.key === 'ArrowDown') {
      // Navigate to next message in history
      if (this.historyIndex >= 0) {
        e.preventDefault();
        if (this.historyIndex > 0) {
          this.historyIndex--;
          this.inputValue = this.inputHistory[this.historyIndex] || '';
        } else {
          // Back to current input
          this.historyIndex = -1;
          this.inputValue = this._savedInput || '';
        }
      }
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
          
          // Refresh media list to show the new image
          this.mediaLoaded = false;
          this.loadMediaFiles();
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
    conv.lastActivity = Date.now(); // Track last activity
    this.conversations = [...this.conversations];

    // Add to input history (keep last 3)
    this.inputHistory = [content, ...this.inputHistory.slice(0, 2)];
    this.historyIndex = -1;
    this._savedInput = '';
    
    this.inputValue = '';
    this.isThinking = true;
    this.reasoningText = 'Thinking...';
    this.streamingResponse = '';
    this.toolsUsed = [];
    
    // Create abort controller for this request with timeout
    this.currentAbortController = new AbortController();
    let wasTimeout = false;
    const CONNECTION_TIMEOUT = 15000; // 15 seconds to establish connection
    let timeoutId = setTimeout(() => {
      console.log('[DA-AI] Connection timed out after 15 seconds');
      wasTimeout = true;
      this.currentAbortController.abort();
    }, CONNECTION_TIMEOUT);

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
              url: f.url,
              fullPath: f.fullPath,
              contentUrl: f.contentUrl,
              content: f.content,
              error: f.error,
            }));
            console.log('[DA-AI] Sending attachments:', atts.length, atts.map(a => ({ name: a.name, uploaded: a.uploaded, path: a.path, url: a.url })));
            return atts;
          })(),
          // Media files selected from the media panel
          mediaFiles: (() => {
            const media = this.selectedAssets.map((f) => ({
              name: f.name || f.path?.split('/').pop(),
              path: f.path,
              ext: f.ext,
              // Build the full URL for the media file
              url: f.path ? `http://localhost:8787/source${f.path}` : null,
            }));
            console.log('[DA-AI] Sending selected media:', media.length, media.map(m => ({ name: m.name, path: m.path })));
            return media;
          })(),
          briefs: (() => {
            const briefData = this.briefs.map((b) => ({
              name: b.name,
              type: b.type,
              content: b.content,
            }));
            console.log('[DA-AI] Sending briefs:', briefData.length, briefData.map(b => b.name));
            return briefData;
          })(),
          pageContext: { org: context.org, project: context.project, page: context.page, sourcePath: `${context.org}/${context.project}/${context.page}` },
          userInfo: { name: this.userName || 'Unknown User', id: this.userId },
          // If there's pending proposed content, send it so AI builds on it instead of fetching fresh
          pendingContent: this.showPreview && this.proposedContent ? this.proposedContent : null,
        }),
      });

      this.uploadedFiles = [];
      this.selectedAssets = []; // Clear selected media after sending
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      
      // Reset timeout on each chunk - 30 second inactivity timeout
      const STREAM_TIMEOUT = 30000;
      const resetStreamTimeout = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          console.log('[DA-AI] Stream timed out - no data for 30 seconds');
          wasTimeout = true;
          this.currentAbortController.abort();
        }, STREAM_TIMEOUT);
      };

      if (reader) {
        resetStreamTimeout(); // Start stream timeout
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          resetStreamTimeout(); // Reset on each chunk
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
                  case 'preview':
                    // AI proposed a change - show preview panel
                    console.log('[DA-AI] Received preview event:', data);
                    this.showProposedChange(
                      data.original || '',
                      data.proposed || '',
                      data.change || {}
                    );
                    break;
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
        
        // Generate summary after first exchange if not already set
        if (!conv.summary && conv.messages.length >= 2) {
          this.generateConversationSummary(conv, fullResponse);
        }
      }
      this.streamingResponse = '';
      clearTimeout(timeoutId); // Clear timeout on success
    } catch (error) {
      clearTimeout(timeoutId); // Clear timeout on error
      this.isThinking = false;
      this.currentAbortController = null;
      if (error.name === 'AbortError') {
        if (wasTimeout) {
          this.reasoningText = 'Error: Timeout';
          conv.messages = [...conv.messages, { type: 'assistant', content: 'Request timed out. The server took too long to respond. Please try again.' }];
        } else {
          this.reasoningText = 'Stopped';
          conv.messages = [...conv.messages, { type: 'assistant', content: 'Request was cancelled.' }];
        }
      } else {
        // Extract short error type for display
        const errorType = error.message?.includes('fetch') ? 'Network' 
          : error.message?.includes('timeout') ? 'Timeout'
          : error.message?.includes('401') ? 'Auth'
          : 'Error';
        this.reasoningText = `Error: ${errorType}`;
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
      <button class="trigger-btn ${this.isOpen ? 'active' : ''}" 
              @click=${this.toggleAssistant} 
              aria-label="${this.isOpen ? 'Close AI Assistant' : 'Open AI Assistant'}"
              aria-expanded=${this.isOpen}
              aria-haspopup="dialog">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
    `;
  }

  renderTabs() {
    return html`
      <div class="tabs-bar">
        <div class="tabs-scroll" role="tablist" aria-label="Chat conversations">
          ${this.conversations.map((conv, index) => html`
            <button class="tab ${conv.id === this.activeTabId ? 'active' : ''}" 
                    @click=${() => this.switchTab(conv.id)}
                    role="tab"
                    aria-selected=${conv.id === this.activeTabId}
                    aria-controls="chat-panel"
                    id="tab-${conv.id}"
                    tabindex=${conv.id === this.activeTabId ? 0 : -1}>
              <span class="tab-name">${conv.name}</span>
              ${this.conversations.length > 1 ? html`<span class="tab-close" @click=${(e) => this.closeTab(conv.id, e)} aria-label="Close ${conv.name}" role="button" tabindex="0">×</span>` : nothing}
            </button>
          `)}
          <button class="tab-add" @click=${this.addNewTab} aria-label="New chat">+</button>
        </div>
        <button class="reset-btn" @click=${this.resetConversation} aria-label="Reset conversation">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
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
    const isError = this.reasoningText?.toLowerCase().includes('error') || this.reasoningText === 'Stopped';
    return html`
      <div class="reasoning-panel ${this.isThinking ? 'thinking' : ''} ${isError ? 'error' : ''}">
        <span class="reasoning-status">${this.isThinking ? '◐' : (isError ? '✕' : '✓')}</span>
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

  renderAssetPanels() {
    return html`
      <div class="asset-browsers">
        <!-- Media Panel -->
        <div class="asset-panel">
          <div class="asset-panel-header" @click=${this.toggleMediaPanel}>
            <span class="panel-toggle-icon">${this.showMediaPanel ? '▼' : '▶'}</span>
            <span>Media</span>
            ${this.mediaLoaded 
              ? html`<span class="asset-count">(${this.mediaFiles.length})</span>`
              : html`<span class="asset-count asset-loading-spinner">◐</span>`
            }
          </div>
          ${this.showMediaPanel ? html`
            <div class="asset-slider">
              ${this.isLoadingAssets && this.mediaFiles.length === 0 ? html`
                <div class="asset-loading">Loading...</div>
              ` : this.mediaFiles.length === 0 ? html`
                <div class="asset-empty">No media found</div>
              ` : this.mediaFiles.map((file) => {
                const isSelected = this.selectedAssets.some((f) => (f.path || f.name) === (file.path || file.name));
                return html`
                  <div 
                    class="asset-thumb-wrapper ${isSelected ? 'selected' : ''}" 
                    @click=${() => this.selectAsset(file)} 
                    title="${file.path || file.name}"
                  >
                    <div class="thumb-loader">◐</div>
                    <img 
                      class="asset-thumb"
                      src="${this.getThumbnailUrl(file)}"
                      alt="${file.name || file.path}"
                      loading="lazy"
                      @load=${(e) => e.target.classList.add('loaded')}
                      @error=${(e) => this.loadThumbnailAuth(file, e.target)}
                    />
                    ${isSelected ? html`<span class="asset-check">✓</span>` : nothing}
                  </div>
                `;
              })}
            </div>
          ` : nothing}
        </div>
        
        <!-- Briefs Panel -->
        <div class="asset-panel">
          <div class="asset-panel-header" @click=${this.toggleBriefsPanel}>
            <span class="panel-toggle-icon">${this.showBriefsPanel ? '▼' : '▶'}</span>
            <span>Briefs</span>
            <span class="asset-count">(${this.briefs.length})</span>
          </div>
          ${this.showBriefsPanel ? html`
            <div 
              class="briefs-dropzone ${this.isDraggingBrief ? 'dragging' : ''}"
              @dragover=${this.handleBriefDragOver}
              @dragleave=${this.handleBriefDragLeave}
              @drop=${this.handleBriefDrop}
            >
              ${this.briefs.length === 0 ? html`
                <div class="dropzone-content">
                  <svg class="dropzone-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                  <span class="dropzone-text">Drop docx, pdf, or txt files here</span>
                  <label class="dropzone-browse">
                    or browse
                    <input type="file" multiple accept=".docx,.doc,.pdf,.txt,.md" @change=${this.handleBriefUpload} style="display:none" />
                  </label>
                </div>
              ` : html`
                <div class="briefs-list">
                  ${this.briefs.map((brief, idx) => html`
                    <div class="brief-chip">
                      <svg class="brief-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span class="brief-name">${brief.name}</span>
                      <button class="brief-remove" @click=${() => this.removeBrief(idx)}>×</button>
                    </div>
                  `)}
                  <label class="brief-add">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    <input type="file" multiple accept=".docx,.doc,.pdf,.txt,.md" @change=${this.handleBriefUpload} style="display:none" />
                  </label>
                </div>
              `}
            </div>
          ` : nothing}
        </div>
      </div>
    `;
  }

  renderPreviewPanel() {
    if (!this.showPreview) return nothing;
    
    // Parse changes for granular list
    const changesList = this.parseChanges();
    
    return html`
      <div class="preview-overlay">
        <div class="preview-container">
          <div class="preview-content">
            <div class="preview-side proposed">
              <div class="preview-label">
                PROPOSED CHANGES
                ${this.previewAnimating 
                  ? html`<span class="working-badge">WORKING</span><span class="typing-cursor">|</span>` 
                  : html`<span class="ready-badge">READY</span>`}
              </div>
              
              <!-- Expandable changes list -->
              ${changesList.length > 0 ? html`
                <details class="changes-list" ?open=${!this.previewAnimating}>
                  <summary class="changes-summary">
                    <span>${changesList.length} change${changesList.length > 1 ? 's' : ''} detected</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="chevron"><polyline points="6 9 12 15 18 9"/></svg>
                  </summary>
                  <ul class="changes-items">
                    ${changesList.map((change, i) => html`
                      <li class="change-item ${change.rejected ? 'rejected' : ''}" id="list-${change.id}">
                        <span class="change-type ${change.type}">${change.type}</span>
                        <span class="change-desc">${change.description}</span>
                        <button class="change-reject" 
                                @click=${() => this.toggleChangeRejection(i)}
                                aria-label="${change.rejected ? 'Restore change' : 'Reject change'}">
                          ${change.rejected ? '↩' : '×'}
                        </button>
                      </li>
                    `)}
                  </ul>
                </details>
              ` : nothing}
              
              <!-- Editor-styled preview -->
              <div class="preview-editor ProseMirror" id="preview-animated"></div>
            </div>
          </div>
          <div class="preview-actions">
            <button class="preview-btn reject" @click=${this.rejectPreview} aria-label="Discard all changes">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Discard all
            </button>
            <button class="preview-btn approve" @click=${this.approvePreview} ?disabled=${this.previewAnimating} aria-label="Apply all changes">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
              ${this.previewAnimating ? 'Writing...' : 'Apply all'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  parseChanges() {
    // Return the accumulated changes list (already populated by showProposedChange)
    return this._allChanges || [];
  }

  // Legacy comparison kept for reference but no longer used
  _legacyParseChanges() {
    // Compare original and proposed content to detect changes
    if (!this.originalContent || !this.proposedContent) return [];
    
    const changes = [];
    const originalDiv = document.createElement('div');
    const proposedDiv = document.createElement('div');
    originalDiv.innerHTML = this.originalContent;
    proposedDiv.innerHTML = this.proposedContent;
    
    // Compare headings
    const origHeadings = [...originalDiv.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    const propHeadings = [...proposedDiv.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    
    // Find new headings
    propHeadings.forEach((prop) => {
      const origMatch = origHeadings.find(o => o.textContent === prop.textContent);
      if (!origMatch) {
        const text = prop.textContent?.slice(0, 25) || 'heading';
        changes.push({ 
          type: 'heading', 
          description: `Added ${prop.tagName}: "${text}${text.length > 25 ? '...' : ''}"`, 
          rejected: false,
          element: prop.tagName.toLowerCase(),
          selector: `${prop.tagName.toLowerCase()}:contains("${prop.textContent?.slice(0, 20)}")`
        });
      }
    });
    
    // Compare paragraphs
    const origParas = originalDiv.querySelectorAll('p');
    const propParas = proposedDiv.querySelectorAll('p');
    
    if (propParas.length > origParas.length) {
      changes.push({ type: 'add', description: `Added ${propParas.length - origParas.length} paragraph(s)`, rejected: false });
    } else if (propParas.length < origParas.length) {
      changes.push({ type: 'remove', description: `Removed ${origParas.length - propParas.length} paragraph(s)`, rejected: false });
    }
    
    // Compare images
    const origImages = originalDiv.querySelectorAll('img, picture');
    const propImages = proposedDiv.querySelectorAll('img, picture');
    
    if (propImages.length > origImages.length) {
      changes.push({ type: 'media', description: `Added ${propImages.length - origImages.length} image(s)`, rejected: false });
    } else if (propImages.length < origImages.length) {
      changes.push({ type: 'media', description: `Removed ${origImages.length - propImages.length} image(s)`, rejected: false });
    }
    
    // Compare buttons/links
    const origButtons = originalDiv.querySelectorAll('a.button, button, .button');
    const propButtons = proposedDiv.querySelectorAll('a.button, button, .button');
    
    if (propButtons.length > origButtons.length) {
      // Find the new button text
      const newButtonTexts = [...propButtons].map(b => b.textContent?.trim()).filter(t => 
        ![...origButtons].some(ob => ob.textContent?.trim() === t)
      );
      newButtonTexts.forEach(text => {
        changes.push({ type: 'add', description: `Added button: "${text}"`, rejected: false });
      });
    }
    
    // Compare links
    const origLinks = originalDiv.querySelectorAll('a:not(.button)');
    const propLinks = proposedDiv.querySelectorAll('a:not(.button)');
    
    if (propLinks.length !== origLinks.length) {
      const diff = propLinks.length - origLinks.length;
      changes.push({ type: 'edit', description: `${diff > 0 ? 'Added' : 'Removed'} ${Math.abs(diff)} link(s)`, rejected: false });
    }
    
    // Compare tables/blocks
    const origTables = originalDiv.querySelectorAll('table, div.block, div[class*="block"]');
    const propTables = proposedDiv.querySelectorAll('table, div.block, div[class*="block"]');
    
    if (propTables.length !== origTables.length) {
      const diff = propTables.length - origTables.length;
      changes.push({ type: 'block', description: `${diff > 0 ? 'Added' : 'Removed'} ${Math.abs(diff)} block(s)`, rejected: false });
    }
    
    // Compare lists
    const origLists = originalDiv.querySelectorAll('ul, ol');
    const propLists = proposedDiv.querySelectorAll('ul, ol');
    
    if (propLists.length !== origLists.length) {
      const diff = propLists.length - origLists.length;
      changes.push({ type: 'edit', description: `${diff > 0 ? 'Added' : 'Removed'} ${Math.abs(diff)} list(s)`, rejected: false });
    }
    
    // If no specific changes detected but content differs
    if (changes.length === 0 && this.originalContent !== this.proposedContent) {
      changes.push({ type: 'edit', description: 'Content modified', rejected: false });
    }
    
    this._detectedChanges = changes;
    return changes;
  }

  toggleChangeRejection(index) {
    if (this._allChanges && this._allChanges[index]) {
      const change = this._allChanges[index];
      change.rejected = !change.rejected;
      
      console.log('[DA-AI] Toggle change:', change.id, 'rejected:', change.rejected);
      
      // Update the preview to show rejected state
      this.updatePreviewWithRejections();
      this.requestUpdate();
    }
  }

  updatePreviewWithRejections() {
    const container = this.shadowRoot?.querySelector('#preview-animated');
    if (!container || !this.proposedContent) return;
    
    // Start with the full proposed content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = this.proposedContent;
    
    // Apply visual state for each change
    this._allChanges.forEach(change => {
      if (change.elementHtml) {
        // Find the element in the preview that matches this change
        const matchEl = this.findElementByHtml(tempDiv, change.elementHtml);
        if (matchEl) {
          matchEl.id = change.id;
          matchEl.classList.add('ai-highlight', 'ai-new');
          if (change.rejected) {
            matchEl.classList.add('ai-rejected');
            matchEl.style.opacity = '0.5';
            matchEl.style.textDecoration = 'line-through';
          } else {
            matchEl.classList.remove('ai-rejected');
            matchEl.style.opacity = '1';
            matchEl.style.textDecoration = 'none';
          }
        }
      }
    });
    
    container.innerHTML = tempDiv.innerHTML;
  }

  findElementByHtml(container, html) {
    // Find an element whose outerHTML matches (or is similar to) the target
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const targetEl = tempDiv.firstElementChild;
    if (!targetEl) return null;
    
    const tagName = targetEl.tagName.toLowerCase();
    const candidates = container.querySelectorAll(tagName);
    
    for (const el of candidates) {
      // Match by text content for headings/buttons
      if (el.textContent?.trim() === targetEl.textContent?.trim()) {
        return el;
      }
      // Match by src for images
      if (tagName === 'img' && el.src === targetEl.src) {
        return el;
      }
    }
    return null;
  }

  updatePreviewHighlights() {
    // Use the new rejection-aware update
    this.updatePreviewWithRejections();
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

  renderConfirmModal() {
    if (!this.showConfirmModal) return nothing;
    const isReset = this.confirmModalAction === 'reset';
    const title = isReset ? 'Reset Chat?' : 'Close Chat?';
    const message = isReset
      ? 'This will clear all messages in this chat. This action cannot be undone.'
      : 'This chat has messages that will be lost. Are you sure you want to close it?';
    
    return html`
      <div class="modal-overlay" @click=${this.confirmModalNo}>
        <div class="confirm-modal" @click=${(e) => e.stopPropagation()}>
          <h3 class="confirm-title">${title}</h3>
          <p class="confirm-message">${message}</p>
          <div class="confirm-actions">
            <button class="confirm-btn cancel" @click=${this.confirmModalNo}>Cancel</button>
            <button class="confirm-btn confirm" @click=${this.confirmModalYes}>${isReset ? 'Reset' : 'Close'}</button>
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

  renderPanelHeader() {
    const activeConv = this.conversations.find((c) => c.id === this.activeTabId);
    const context = parsePageContext();
    const project = context.project || 'project';
    const page = context.page || 'page';
    const title = activeConv?.title || activeConv?.name || 'New Chat';
    const subtitle = activeConv?.summary || 'Your AI-powered document assistant';
    
    // Format last activity time
    let lastActivityText = '';
    if (activeConv?.lastActivity) {
      const lastActivity = new Date(activeConv.lastActivity);
      const now = new Date();
      const diffMs = now - lastActivity;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      
      if (diffMins < 1) {
        lastActivityText = 'Just now';
      } else if (diffMins < 60) {
        lastActivityText = `${diffMins}m ago`;
      } else if (diffHours < 24) {
        lastActivityText = `${diffHours}h ago`;
      } else {
        lastActivityText = lastActivity.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
    }
    
    return html`
      <div class="panel-header-bar">
        <div>
          <div class="panel-context">[${project}][${page}]${lastActivityText ? html` • <span class="last-activity">${lastActivityText}</span>` : ''}</div>
          <h2>${title}</h2>
          <div class="panel-subtitle">${subtitle}</div>
        </div>
        <button class="reset-btn" @click=${this.toggleAssistant} title="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;
  }

  renderPanel() {
    if (!this.isOpen) return nothing;
    return html`
      <div class="panel-overlay" @click=${this.toggleAssistant} aria-hidden="true"></div>
      <div class="panel" 
           role="dialog" 
           aria-modal="true" 
           aria-labelledby="ai-assistant-title"
           @keydown=${this.handlePanelKeyDown}>
        <!-- Skip link for keyboard users -->
        <a href="#ai-input" class="skip-link" @click=${this.focusInput}>Skip to input</a>
        
        ${this.renderPanelHeader()}
        ${this.renderTabs()}
        <div class="messages-container" 
             role="log" 
             aria-live="polite" 
             aria-label="Chat messages"
             aria-busy=${this.isThinking}>
          ${this.renderMessages()}
        </div>
        ${this.renderReasoningPanel()}
        ${this.renderToolsPanel()}
        ${this.renderAssetPanels()}
        ${this.renderFileChips()}
        ${this.renderAttachmentPills()}
        <div class="input-container" role="form" aria-label="Message input">
          <button class="mic-btn ${this.isListening ? 'listening' : ''}" 
                  @click=${this.toggleListening} 
                  aria-label="${this.isListening ? 'Stop listening' : 'Voice input'}"
                  aria-pressed=${this.isListening}
                  ?disabled=${this.isThinking}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
          <input id="ai-input"
                 class="input-field" 
                 type="text" 
                 placeholder="${this.isListening ? (this._interimTranscript || 'Listening...') : 'Ask me anything...'}" 
                 .value=${this.inputValue} 
                 @input=${this.handleInputChange} 
                 @keydown=${this.handleKeyDown} 
                 ?disabled=${this.isThinking}
                 aria-label="Type your message"
                 autocomplete="off" />
          ${this.isThinking
            ? html`<button class="stop-btn" @click=${this.stopRequest} aria-label="Stop request">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12"/></svg>
              </button>`
            : html`<button class="send-btn" @click=${this.sendMessage} ?disabled=${!this.inputValue.trim()} aria-label="Send message">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>`
          }
        </div>
        ${this.renderFooter()}
      </div>
      ${this.renderPromptsModal()}
      ${this.renderConfirmModal()}
      ${this.renderPreviewPanel()}
    `;
  }

  handlePanelKeyDown(e) {
    // Close on Escape
    if (e.key === 'Escape') {
      e.preventDefault();
      this.toggleAssistant();
    }
  }

  focusInput(e) {
    e?.preventDefault();
    this.shadowRoot?.querySelector('#ai-input')?.focus();
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

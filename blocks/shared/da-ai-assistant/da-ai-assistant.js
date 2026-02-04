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
    selectedAsset: { type: Object, state: true },
    mediaLoaded: { type: Boolean, state: true },
    isDraggingBrief: { type: Boolean, state: true },
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
    this.selectedAsset = null;
    this.mediaLoaded = false;
    this.isDraggingBrief = false;

    this.enabledTools = {};
    AVAILABLE_TOOLS.forEach((tool) => {
      this.enabledTools[tool.id] = tool.enabled;
    });

    // Initialize Speech Recognition if available
    this.initSpeechRecognition();
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
    for (const file of files) {
      const name = file.name;
      const type = file.type;
      
      // Accept docx, pdf, txt, md
      if (!/(\.docx?|\.pdf|\.txt|\.md)$/i.test(name) && 
          !type.includes('word') && 
          !type.includes('pdf') && 
          !type.includes('text')) {
        console.warn('[DA-AI] Unsupported brief type:', name, type);
        continue;
      }
      
      console.log('[DA-AI] Processing brief:', name, type);
      
      try {
        let content = '';
        
        // Extract text content based on file type
        if (type.includes('text') || /\.(txt|md)$/i.test(name)) {
          // Plain text - read directly on client
          content = await file.text();
          this.briefs = [...this.briefs, { name, type, content, size: file.size }];
          console.log('[DA-AI] Brief added (text):', name, 'content length:', content.length);
        } else {
          // Binary files (docx, pdf) - send to server for parsing
          const base64 = await this.fileToBase64(file);
          const parsed = await this.parseBriefOnServer(name, type, base64);
          
          this.briefs = [...this.briefs, {
            name,
            type,
            content: parsed.content || `[Failed to parse ${name}]`,
            size: file.size,
          }];
          console.log('[DA-AI] Brief added (parsed):', name, 'content length:', parsed.content?.length);
        }
      } catch (err) {
        console.error('[DA-AI] Failed to process brief:', err);
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
    const isLocal = window.location.hostname === 'localhost';
    
    // Path from API already includes /org/repo/path, so just prepend the base
    // Remove leading slash if present to avoid double slashes
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    
    if (isLocal) {
      return `http://localhost:8787/source/${cleanPath}`;
    }
    return `https://content.da.live/${cleanPath}`;
  }

  async loadThumbnailAuth(file, imgElement) {
    const isLocal = window.location.hostname === 'localhost';
    if (!isLocal) return; // Production uses public CDN, no auth needed
    
    const filePath = file.path || file.name;
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const url = `http://localhost:8787/source/${cleanPath}`;
    
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
    this.selectedAsset = file;
    const filePath = file.path || file.name;
    const url = this.getThumbnailUrl(file);
    
    // Add reference to input based on file type
    if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filePath)) {
      // For images, add markdown-style reference
      const prefix = this.inputValue && !this.inputValue.endsWith(' ') ? ' ' : '';
      this.inputValue = `${this.inputValue}${prefix}[image: ${file.name || filePath}]`;
    } else {
      // For docs, add page reference
      const prefix = this.inputValue && !this.inputValue.endsWith(' ') ? ' ' : '';
      this.inputValue = `${this.inputValue}${prefix}[page: ${filePath}]`;
    }
    
    // Focus the input
    this.updateComplete.then(() => {
      this.shadowRoot?.querySelector('.input-field')?.focus();
    });
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
              ` : this.mediaFiles.map((file) => html`
                <div 
                  class="asset-thumb-wrapper ${this.selectedAsset === file ? 'selected' : ''}" 
                  @click=${() => this.selectAsset(file)} 
                  title="${file.path || file.name}"
                >
                  <img 
                    class="asset-thumb"
                    src="${this.getThumbnailUrl(file)}"
                    alt="${file.name || file.path}"
                    loading="lazy"
                    @error=${(e) => this.loadThumbnailAuth(file, e.target)}
                  />
                </div>
              `)}
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

  renderPanel() {
    if (!this.isOpen) return nothing;
    return html`
      <div class="panel-overlay" @click=${this.toggleAssistant}></div>
      <div class="panel">
        ${this.renderTabs()}
        <div class="messages-container">${this.renderMessages()}</div>
        ${this.renderReasoningPanel()}
        ${this.renderToolsPanel()}
        ${this.renderAssetPanels()}
        ${this.renderFileChips()}
        <div class="input-container">
          <button class="mic-btn ${this.isListening ? 'listening' : ''}" @click=${this.toggleListening} title="${this.isListening ? 'Stop listening' : 'Voice input'}" ?disabled=${this.isThinking}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
          <input class="input-field" type="text" placeholder="${this.isListening ? (this._interimTranscript || 'Listening...') : 'Ask me anything...'}" .value=${this.inputValue} @input=${this.handleInputChange} @keydown=${this.handleKeyDown} ?disabled=${this.isThinking} />
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
      ${this.renderConfirmModal()}
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

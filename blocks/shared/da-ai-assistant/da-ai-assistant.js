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

import { LitElement, html } from 'da-lit';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/shared/da-ai-assistant/da-ai-assistant.css');

/**
 * DA AI Assistant Web Component
 * Embeds the AI assistant as a web fragment
 */
class DaAiAssistant extends LitElement {
  static properties = {
    isOpen: { type: Boolean, state: true },
    isLoading: { type: Boolean, state: true },
  };

  constructor() {
    super();
    this.isOpen = false;
    this.isLoading = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.loadWebFragmentScript();
  }

  /**
   * Load the web-fragments client library
   * The web-fragment-host element will handle fetching and rendering
   * the remote application from the deployed endpoint
   */
  async loadWebFragmentScript() {
    if (customElements.get('web-fragment')) return;

    try {
      const { initializeWebFragments } = await import('da-web-fragments');
      initializeWebFragments();
    } catch (error) {
      console.error('Failed to load web fragments:', error);
    }
  }

  toggleAssistant() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.isLoading = true;
      // Wait for render then style the web-fragment-host and hide loading
      setTimeout(() => this.styleFragmentHost(), 100);
    }
  }

  styleFragmentHost(retries = 20) {
    const webFragment = this.shadowRoot?.querySelector('web-fragment');
    if (webFragment?.shadowRoot) {
      const host = webFragment.shadowRoot.querySelector('web-fragment-host');
      if (host) {
        host.style.cssText = 'display: block !important; height: 100% !important; overflow: auto !important;';
        // Check if iframe content is ready
        const iframe = host.querySelector('iframe');
        if (iframe) {
          // Wait for iframe to signal ready or timeout
          const checkReady = () => {
            try {
              const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (iframeDoc && iframeDoc.readyState === 'complete') {
                // Give a small delay for styles to apply
                setTimeout(() => {
                  this.isLoading = false;
                }, 150);
                return;
              }
            } catch (e) {
              // Cross-origin, use timeout fallback
            }
            // Retry
            if (retries > 0) {
              setTimeout(checkReady, 100);
            } else {
              this.isLoading = false;
            }
          };
          checkReady();
          return;
        }
      }
    }
    // Retry if not found yet
    if (retries > 0) {
      setTimeout(() => this.styleFragmentHost(retries - 1), 100);
    } else {
      // Fallback: hide loading after max retries
      this.isLoading = false;
    }
  }

  renderTriggerButton() {
    return html`
      <button 
        class="da-ai-trigger ${this.isOpen ? 'is-open' : ''}" 
        @click=${this.toggleAssistant}
        aria-label="Toggle AI Assistant"
        title="AI Assistant">
        ${this.isOpen ? html`
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ` : html`
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/>
            <circle cx="8" cy="10" r="1.5"/>
            <circle cx="12" cy="10" r="1.5"/>
            <circle cx="16" cy="10" r="1.5"/>
          </svg>
        `}
      </button>
    `;
  }

  renderLoadingOverlay() {
    if (!this.isLoading) return html``;
    
    return html`
      <div class="da-ai-loading-overlay">
        <div class="da-ai-loading-skeleton">
          <div class="skeleton-header"></div>
          <div class="skeleton-body">
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
            <div class="skeleton-line"></div>
          </div>
          <div class="skeleton-input"></div>
        </div>
      </div>
    `;
  }

  renderAssistant() {
    if (!this.isOpen) return html``;

    return html`
      <div class="da-ai-container ${this.isOpen ? 'is-visible' : ''}">
        <div class="da-ai-header">
          <h3>AI Assistant</h3>
          <button 
            class="da-ai-close" 
            @click=${this.toggleAssistant}
            aria-label="Close AI Assistant">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="da-ai-content">
          ${this.renderLoadingOverlay()}
          <web-fragment fragment-id="da-ai-assistant"></web-fragment>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="da-ai-assistant-wrapper">
        ${this.renderTriggerButton()}
        ${this.renderAssistant()}
      </div>
    `;
  }
}

customElements.define('da-ai-assistant', DaAiAssistant);

/**
 * Initialize the AI assistant
 * This can be called from anywhere in the app
 */
export default function init(el) {
  const assistant = document.createElement('da-ai-assistant');
  el.append(assistant);
  return assistant;
}

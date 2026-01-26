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
    this.isLoading = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.loadWebFragmentScript();
  }

  /**
   * Load the web-fragments client library and register custom elements
   */
  async loadWebFragmentScript() {
    if (customElements.get('web-fragment')) return;

    try {
      // Load web-fragments client library (bundled in deps/)
      const { initializeWebFragments } = await import('da-web-fragments');

      // Initialize and register <web-fragment> custom element
      initializeWebFragments();
    } catch (error) {
      console.error('Failed to load web fragments:', error);
    }
  }

  toggleAssistant() {
    this.isOpen = !this.isOpen;
  }

  updated(changedProperties) {
    if (changedProperties.has('isOpen')) {
      if (this.isOpen) {
        // Create fragment after DOM updates
        this.createFragment();
      } else {
        // Fragment is removed when container is removed from DOM
      }
    }
  }

  createFragment() {
    const container = this.shadowRoot.querySelector('.da-ai-content');
    if (container && !container.querySelector('web-fragment')) {
      const fragment = document.createElement('web-fragment');
      fragment.setAttribute('src', '/__fragments/da-ai-chat/');
      container.appendChild(fragment);
    }
  }

  renderTriggerButton() {
    return html`
      <button 
        class="da-ai-trigger ${this.isOpen ? 'is-open' : ''}" 
        @click=${this.toggleAssistant}
        aria-label="Toggle AI Assistant"
        title="AI Assistant">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${this.isOpen ? html`
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          ` : html`
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          `}
        </svg>
      </button>
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
          <web-fragment fragment-id="da-ai-chat"></web-fragment>
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

import { LitElement, html, nothing } from "da-lit";
import getStyle from "https://da.live/nx/utils/styles.js";

const sheet = await getStyle(import.meta.url);

/**
 * DaTitle
 *
 * A small LitElement-based title/header widget that shows the current document name
 * and provides Preview/Publish action buttons. It emits a custom event
 * `editor-preview-publish` when an action is triggered so the host can handle it.
 */
export default class DaTitle extends LitElement {
  static properties = {
    details: { type: Object },
    _actionsVis: {},
    _status: { state: true },
    _fixedActions: { state: true },
    hasErrors: { type: Boolean },
  };

  /** Adopt the shared stylesheet when the element is attached. */
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  /** Observe the H1 to toggle fixed actions when the title scrolls out of view. */
  firstUpdated() {
    const observer = new IntersectionObserver((entries) => {
      this._fixedActions = !entries[0].isIntersecting;
    });

    const element = this.shadowRoot.querySelector("h1");
    if (element) observer.observe(element);
  }

  /** Set an error status and update action button styles. */
  handleError(json, action, icon) {
    this._status = { ...json.error, action };
    icon.classList.remove("is-sending");
    icon.parentElement.classList.add("is-error");
  }

  /** Handle a user action; toggles menu and dispatches `editor-preview-publish`. */
  async handleAction(action) {
    this.toggleActions();
    this._status = null;
    const sendBtn = this.shadowRoot.querySelector(".da-title-action-send-icon");

    if (action === "preview" || action === "publish") {
      // If form has validation errors, show a toast instead of dispatching
      if (this.hasErrors) {
        let toast = document.querySelector('da-toast');
        if (!toast) {
          toast = document.createElement('da-toast');
          document.body.appendChild(toast);
        }
        try { toast.show('Form has validation errors. Please fix them before continuing.', { variant: 'error' }); } catch {}
        return;
      }
      let myEvent = new CustomEvent("editor-preview-publish", {
        detail: { action, location: sendBtn },
        bubbles: true,
        composed: true,
      });
      this.dispatchEvent(myEvent);
    }
  }

  /** Toggle visibility of the action controls. */
  toggleActions() {
    this._actionsVis = !this._actionsVis;
  }

  /** Handle send button click: if errors exist, show toast; otherwise toggle actions. */
  onSendClick = () => {
    if (this.hasErrors) {
      let toast = document.querySelector('da-toast');
      if (!toast) {
        toast = document.createElement('da-toast');
        document.body.appendChild(toast);
      }
      try { toast.show('Please correct the highlighted errors before continuing.', { variant: 'error' }); } catch {}
      return;
    }
    this.toggleActions();
  }

  /** Close actions if error state becomes true. */
  updated(changed) {
    if (changed.has('hasErrors') && this.hasErrors) {
      this._actionsVis = false;
    }
  }

  /** Render the title header and action buttons. */
  render() {
    return html`
      <div class="da-title-inner">
        <div class="da-title-name">
          <a
            href="${this.details.parent}"
            target="${this.details.parent}"
            class="da-title-name-label"
            >${this.details.parentName}</a
          >
          <h1>${this.details.name}</h1>
        </div>
        <div class="da-title-collab-actions-wrapper">
          <div
            class="da-title-actions ${this._fixedActions
              ? "is-fixed"
              : ""} ${this._actionsVis ? "is-open" : ""}"
          >
            <button
              @click=${() => this.handleAction("preview")}
              class="con-button blue da-title-action"
              aria-label="Send"
            >
              Preview
            </button>
            <button
              @click=${() => this.handleAction("publish")}
              class="con-button blue da-title-action"
              aria-label="Send"
            >
              Publish
            </button>
            <button
              @click=${this.onSendClick}
              class="con-button blue da-title-action-send"
              aria-label="Send"
            >
              <span class="da-title-action-send-icon"></span>
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("da-title", DaTitle);



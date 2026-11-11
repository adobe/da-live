import { LitElement, html, nothing } from 'da-lit';
import { getNx2 } from '../../../scripts/utils.js';
import { spriteIcon } from '../icons.js';

/**
 * A toolbar button. It is disabled while its command does not apply.
 * @typedef {object} ToolbarTool
 * @property {string} id The name the button is found by.
 * @property {string} label The accessible name.
 * @property {string} icon The name of the S2 icon.
 * @property {string} [keys] The ProseMirror key name of the shortcut, such as `Mod-Shift-z`.
 * @property {import('../utils/rich-text/commands.js').RichTextCommand} command Applies the tool.
 * @property {(state: object) => boolean} [isActive] Whether a toggle is on. Actions have none.
 * @property {(state: object) => boolean} [isVisible] Whether the tool applies. Others always show.
 */

/**
 * A picker that applies one of its values.
 * @typedef {object} ToolbarPicker
 * @property {string} label The accessible name.
 * @property {object[]} items The `nx-picker` items.
 * @property {(state: object) => string|null} getValue The value at the selection, if any.
 * @property {(state: object) => boolean} isEnabled Whether a value can apply at the selection.
 * @property {(value: string) => import('../utils/rich-text/commands.js').RichTextCommand}
 *   commandFor Builds the command that applies a value.
 */

/**
 * The tools of a toolbar, in the order they show.
 * @typedef {object} Toolset
 * @property {ToolbarTool[]} leading The tools that lead the bar.
 * @property {ToolbarPicker} picker The picker after them.
 * @property {ToolbarTool[][]} groups The groups of the bar and the floating toolbar.
 * @property {ToolbarTool[][]} menuGroups The groups only the more menu offers.
 */

const nx2 = getNx2();
const { loadStyle } = await import(`${nx2}/utils/utils.js`);

const style = await loadStyle(import.meta.url);

const ELEMENT_NAME = 'form-rich-text-toolbar';

const LABELS = {
  toolbar: 'Formatting',
  floating: 'Selection formatting',
  more: 'More formatting',
};

const SELECTORS = {
  toolbar: '.form-rich-text-toolbar',
  barTools: ':scope > [data-tool]',
  picker: '.form-rich-text-picker',
  moreButton: '[data-more]',
  menu: '.form-rich-text-menu',
};

/** The name of the `Mod` key on this platform. */
const MODIFIER_LABEL = /Mac|iP(hone|[oa]d)/.test(navigator.platform) ? '⌘' : 'Ctrl';

const loadPicker = () => import(`${nx2}/blocks/shared/picker/picker.js`);

const loadPopover = () => import(`${nx2}/blocks/shared/popover/popover.js`);

/**
 * Formats a part of a ProseMirror key name for this platform.
 * @param {string} key A modifier or a key, such as `Mod` or `z`.
 * @returns {string} The label, such as `⌘` or `Z`.
 */
const formatKey = (key) => {
  if (key === 'Mod') return MODIFIER_LABEL;
  return key.length === 1 ? key.toUpperCase() : key;
};

/**
 * Formats the tooltip of a tool with its shortcut for this platform.
 * @param {ToolbarTool} tool The tool.
 * @returns {string} The tooltip.
 */
const formatTitle = ({ label, keys }) => (keys
  ? `${label} (${keys.split(/-(?!$)/).map(formatKey).join('+')})`
  : label);

/**
 * Builds a check for bar tools that sit at or after an index.
 * @param {ToolbarTool[]} tools The bar tools.
 * @param {number} index The index of the first bar tool in the more menu.
 * @returns {(tool: ToolbarTool) => boolean} Whether a tool moved into the more menu.
 */
const overflowsFrom = (tools, index) => (tool) => tools.indexOf(tool) >= index;

/**
 * Keeps the editor focused while a toolbar button is pressed.
 * @param {MouseEvent} event The `mousedown` event.
 */
const keepEditorFocus = (event) => event.preventDefault();

/**
 * The formatting toolbar of a rich-text field. It renders a toolset against the editor
 * state and asks the field to run commands. The bar variant sits above the editor and moves
 * the tools that do not fit into its more menu. The floating variant sits next to the
 * selection. The checks that read the selection only apply while it shows. Until then no
 * tool is active, tools with a visibility check hide, and the picker shows its first value.
 * @property {object} [editorState] The ProseMirror editor state.
 * @property {Toolset} [toolset] The tools, once the editor loaded.
 * @property {boolean} focused Whether the field has the focus, so the selection shows.
 * @property {string} [openTool] The id of the tool whose dialog is open.
 * @property {boolean} disabled Whether the field cannot be edited.
 * @property {boolean} floating Whether this is the toolbar next to the selection.
 * @fires form-rich-text-command With the `command` to run.
 */
class FormRichTextToolbar extends LitElement {
  static properties = {
    editorState: { attribute: false },
    toolset: { attribute: false },
    focused: { type: Boolean },
    openTool: { type: String },
    disabled: { type: Boolean },
    floating: { type: Boolean, reflect: true },
    _overflowAt: { state: true },
    _menuOpen: { state: true },
  };

  /** The ids of the bar tools hidden at the last measurement. */
  _hiddenTools;

  /** Moves bar tools into the more menu when the toolbar narrows. */
  _resizeObserver;

  /** Adopts the stylesheet and measures the bar again when the toolbar comes back. */
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    if (this.hasUpdated) {
      this._observeBar();
    }
  }

  /** Releases the observer when the toolbar leaves the page. */
  disconnectedCallback() {
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    super.disconnectedCallback();
  }

  /** Starts loading the picker. */
  firstUpdated() {
    loadPicker().catch(() => {});
  }

  /**
   * Measures the bar again when it changed, and keeps the more menu in step.
   * @param {Map<string, unknown>} changed The properties that changed.
   */
  updated(changed) {
    if (this._measures) {
      this._observeBar();
      this._syncBarLayout(changed);
    }
    this._syncMenu(changed);
  }

  /**
   * Answers whether the bar measures which tools fit. Floating toolbars always fit.
   * @returns {boolean} Whether the toolbar is a bar with tools.
   */
  get _measures() {
    return !this.floating && !!this.toolset;
  }

  /**
   * The editor state while the selection shows. The editor keeps a selection while
   * blurred, so the toolbar only reflects it while the field or a tool's dialog has focus.
   * @returns {object|undefined} The state, or undefined while the selection does not show.
   */
  get _selection() {
    return this.focused || this.openTool ? this.editorState : undefined;
  }

  /**
   * The tools of the bar line, in order. Those that do not fit move into the more menu.
   * @returns {ToolbarTool[]} The tools.
   */
  get _barTools() {
    return [...this.toolset.leading, ...this.toolset.groups.flat()];
  }

  /**
   * The index of the first bar tool in the more menu.
   * @returns {number} The index, or the number of bar tools when all fit.
   */
  get _overflowIndex() {
    return this._overflowAt ?? this._barTools.length;
  }

  /**
   * The more menu, which `nx-popover` upgrades once the menu first opens.
   * @returns {HTMLElement} The `nx-popover`.
   */
  get _menu() {
    return this.shadowRoot.querySelector(SELECTORS.menu);
  }

  /**
   * Answers whether a tool hides. A tool with a visibility check hides until the selection
   * shows and passes it.
   * @param {ToolbarTool} tool The tool.
   * @returns {boolean} Whether the tool hides.
   */
  _isHidden({ isVisible }) {
    if (!isVisible) {
      return false;
    }
    return !this._selection || !isVisible(this._selection);
  }

  /**
   * Answers whether a tool is disabled, which it is while its command does not apply.
   * @param {ToolbarTool} tool The tool.
   * @returns {boolean} Whether the tool is disabled.
   */
  _isDisabled({ command }) {
    return this.disabled || !this.editorState || !command(this.editorState);
  }

  /**
   * Answers whether a toggle shows as pressed, which it also does while its dialog is open.
   * @param {ToolbarTool} tool The toggle.
   * @returns {boolean} Whether it is pressed.
   */
  _isPressed({ id, isActive }) {
    return id === this.openTool || (!!this._selection && isActive(this._selection));
  }

  /**
   * Measures the bar again when its toolset changes or a tool shows or hides.
   * @param {Map<string, unknown>} changed The properties that changed.
   */
  _syncBarLayout(changed) {
    const hiddenTools = this._barTools
      .filter((tool) => this._isHidden(tool))
      .map(({ id }) => id)
      .join();
    const layoutChanged = changed.has('toolset') || hiddenTools !== this._hiddenTools;
    this._hiddenTools = hiddenTools;
    if (layoutChanged) {
      this._measureBar();
    }
  }

  /**
   * Closes the more menu when a tool opens its dialog, and keeps it at its button.
   * @param {Map<string, unknown>} changed The properties that changed.
   */
  _syncMenu(changed) {
    if (!this._menuOpen) {
      return;
    }
    if (changed.has('openTool') && this.openTool) {
      this._menu.close();
      return;
    }
    this._menu.reposition();
  }

  /** Measures the bar whenever it or the picker resizes. */
  _observeBar() {
    if (!this._measures || this._resizeObserver) {
      return;
    }

    const bar = this.shadowRoot.querySelector(SELECTORS.toolbar);
    this._resizeObserver = new ResizeObserver(() => this._measureBar());
    this._resizeObserver.observe(bar, { box: 'border-box' });
    this._resizeObserver.observe(bar.querySelector(SELECTORS.picker));
  }

  /** Moves the bar tools that wrap past the single visible line into the more menu. */
  _measureBar() {
    const bar = this.shadowRoot.querySelector(SELECTORS.toolbar);
    const tools = [...bar.querySelectorAll(SELECTORS.barTools)];
    const lineTop = bar.querySelector(SELECTORS.picker).offsetTop;
    const wrappedIndex = tools.findIndex((tool) => tool.offsetTop > lineTop);
    this._overflowAt = wrappedIndex === -1 ? tools.length : wrappedIndex;
  }

  /**
   * Asks the field to run a command.
   * @param {import('../utils/rich-text/commands.js').RichTextCommand} command The command.
   */
  _requestCommand(command) {
    this.dispatchEvent(new CustomEvent('form-rich-text-command', { detail: { command } }));
  }

  /**
   * Asks the field to apply the value picked.
   * @param {CustomEvent} event The `change` event of the picker.
   */
  _onPick(event) {
    event.stopPropagation();
    this._requestCommand(this.toolset.picker.commandFor(event.detail.value));
  }

  /** Opens the more menu, or closes it when it is open. */
  _onMore() {
    if (this._menuOpen) {
      this._menu.close();
    } else {
      this._openMenu();
    }
  }

  /** Loads the popover and opens the more menu at its button. */
  async _openMenu() {
    try {
      await loadPopover();
    } catch {
      return;
    }

    this._menuOpen = true;
    await this.updateComplete;
    const anchor = this.shadowRoot.querySelector(SELECTORS.moreButton);
    const placement = this.floating ? 'above' : 'below-end';
    this._menu.show({ anchor, placement });
  }

  /**
   * Forgets the closed menu.
   * @param {Event} event The `close` event of the popover.
   */
  _onMenuClose(event) {
    event.stopPropagation();
    this._menuOpen = false;
  }

  /**
   * Renders a tool button. The floating toolbar's buttons are skipped by the keyboard.
   * @param {ToolbarTool} tool The tool.
   * @param {object} [options] The render settings.
   * @param {boolean} [options.overflow] Whether the tool moved into the more menu.
   * @returns {import('da-lit').TemplateResult} The button.
   */
  _renderTool(tool, { overflow } = {}) {
    const classes = [overflow && 'is-overflow', this._isHidden(tool) && 'is-hidden'];
    const pressed = tool.isActive ? String(this._isPressed(tool)) : nothing;
    return html`
      <button
        type="button"
        class="form-rich-text-button ${classes.filter(Boolean).join(' ')}"
        data-tool=${tool.id}
        title=${formatTitle(tool)}
        aria-label=${tool.label}
        tabindex=${this.floating ? '-1' : nothing}
        aria-pressed=${pressed}
        ?disabled=${this._isDisabled(tool)}
        @mousedown=${keepEditorFocus}
        @click=${() => this._requestCommand(tool.command)}
      >${spriteIcon(tool.icon)}</button>
    `;
  }

  /**
   * Renders groups of tools with separators between them.
   * @param {ToolbarTool[][]} groups The groups.
   * @returns {import('da-lit').TemplateResult[]} The groups.
   */
  _renderGroups(groups) {
    return groups.map((group, index) => html`
      ${index ? html`<span class="form-rich-text-separator"></span>` : nothing}
      ${group.map((tool) => this._renderTool(tool))}
    `);
  }

  /**
   * Renders the bar groups, hiding the tools that moved into the more menu.
   * @returns {import('da-lit').TemplateResult[]} The groups.
   */
  _renderBarGroups() {
    const overflows = overflowsFrom(this._barTools, this._overflowIndex);
    return this.toolset.groups.map((group) => html`
      <span class="form-rich-text-separator ${overflows(group[0]) ? 'is-overflow' : ''}"></span>
      ${group.map((tool) => this._renderTool(tool, { overflow: overflows(tool) }))}
    `);
  }

  /**
   * Renders the picker, which shows its first value until the selection has one.
   * @returns {import('da-lit').TemplateResult} The picker.
   */
  _renderPicker() {
    const { label, items, getValue, isEnabled } = this.toolset.picker;
    const selection = this._selection;
    const unavailable = this.disabled || (!!selection && !isEnabled(selection));
    const value = (selection && getValue(selection)) ?? items.find((item) => item.value)?.value;
    return html`
      <div class="form-rich-text-picker${unavailable ? ' is-disabled' : ''}" title=${label}>
        <nx-picker
          aria-label=${label}
          ?inert=${unavailable}
          .items=${items}
          .value=${value}
          @change=${this._onPick}
        ></nx-picker>
      </div>
    `;
  }

  /**
   * Renders the button that opens the more menu.
   * @returns {import('da-lit').TemplateResult} The button.
   */
  _renderMoreButton() {
    return html`
      <button
        type="button"
        class="form-rich-text-button${this.floating ? '' : ' form-rich-text-more'}"
        data-more
        title=${LABELS.more}
        aria-label=${LABELS.more}
        aria-haspopup="true"
        aria-expanded=${String(!!this._menuOpen)}
        tabindex=${this.floating ? '-1' : nothing}
        ?disabled=${this.disabled || !this.toolset}
        @mousedown=${keepEditorFocus}
        @click=${this._onMore}
      >${spriteIcon('more')}</button>
    `;
  }

  /**
   * Renders the tools of the open more menu, the bar tools that did not fit and the menu
   * groups. The floating toolbar shows every bar tool, so its menu only adds the latter.
   * @returns {import('da-lit').TemplateResult} The tools.
   */
  _renderMenuTools() {
    const { groups, menuGroups } = this.toolset;
    const overflows = overflowsFrom(this._barTools, this.floating ? Infinity : this._overflowIndex);
    const overflowed = groups
      .map((group) => group.filter(overflows))
      .filter((group) => group.length);
    return html`
      <div class="form-rich-text-menu-row" role="group" aria-label=${LABELS.more}>
        ${this._renderGroups([...overflowed, ...menuGroups])}
      </div>
    `;
  }

  /**
   * Renders the more menu, with its tools while it is open.
   * @returns {import('da-lit').TemplateResult} The menu.
   */
  _renderMenu() {
    return html`
      <nx-popover class="form-rich-text-menu" @close=${this._onMenuClose}>
        ${this._menuOpen ? this._renderMenuTools() : nothing}
      </nx-popover>
    `;
  }

  /**
   * Renders the tools of the floating toolbar, which all fit next to the selection.
   * @returns {import('da-lit').TemplateResult} The tools.
   */
  _renderFloatingTools() {
    return html`
      ${this._renderGroups(this.toolset.groups)}
      <span class="form-rich-text-separator"></span>
    `;
  }

  /**
   * Renders the tools of the bar, starting with the leading tools and the picker.
   * @returns {import('da-lit').TemplateResult} The tools.
   */
  _renderBarTools() {
    return html`
      ${this.toolset.leading.map((tool) => this._renderTool(tool))}
      <span class="form-rich-text-separator"></span>
      ${this._renderPicker()}
      ${this._renderBarGroups()}
    `;
  }

  /**
   * Renders the tools once the toolset loaded.
   * @returns {import('da-lit').TemplateResult|typeof nothing} The tools, or nothing.
   */
  _renderTools() {
    if (!this.toolset) {
      return nothing;
    }
    return this.floating ? this._renderFloatingTools() : this._renderBarTools();
  }

  render() {
    const label = this.floating ? LABELS.floating : LABELS.toolbar;
    return html`
      <div class="form-rich-text-toolbar" role="toolbar" aria-label=${label}>
        ${this._renderTools()}
        ${this._renderMoreButton()}
      </div>
      ${this._renderMenu()}
    `;
  }
}

if (!customElements.get(ELEMENT_NAME)) customElements.define(ELEMENT_NAME, FormRichTextToolbar);

export default FormRichTextToolbar;

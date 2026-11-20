const stylesheet = new CSSStyleSheet();
stylesheet.replaceSync(`
  :host {
    display: contents;
    color: var(--s2-gray-900, #242424);
    font: 400 14px/20px var(--s2-font-family, system-ui, sans-serif);
  }

  button, input { box-sizing: border-box; font: inherit; color: inherit; }
  button { cursor: pointer; }
  button:disabled { cursor: default; }

  svg {
    width: 18px;
    height: 18px;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .branch-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid var(--s2-gray-300, #d5d5d5);
    border-radius: 8px;
    background: var(--s2-gray-25, #fff);
    white-space: nowrap;
  }

  .branch-trigger[data-branch] {
    color: var(--s2-blue-1000, #244bb1);
    background: var(--s2-blue-100, #edf2ff);
    border-color: var(--s2-blue-300, #c0cff7);
  }

  .branch-trigger:hover, .branch-trigger[aria-expanded='true'], .branch-option:hover:enabled {
    background: var(--s2-gray-100, #f3f3f3);
  }

  .chevron { width: 14px; height: 14px; }
  [aria-expanded='true'] .chevron { transform: rotate(180deg); }

  :focus-visible {
    outline: 2px solid var(--s2-blue-900, #385bff);
    outline-offset: 2px;
  }

  [popover] {
    box-sizing: border-box;
    position: fixed;
    inset: var(--branch-top, auto) auto var(--branch-bottom, auto) var(--branch-left, auto);
    margin: 0;
    width: min(288px, calc(100vw - 16px));
    max-height: var(--branch-max-height, calc(100vh - 16px));
    overflow: auto;
    padding: 12px;
    color: inherit;
    background: var(--s2-gray-25, #fff);
    border: 1px solid var(--s2-gray-300, #d5d5d5);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 16%);
  }

  h2 { margin: 0 0 6px; padding-inline: 8px; font-size: 13px; font-weight: 600; }

  .branch-option {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 32px;
    padding: 4px 8px;
    text-align: start;
    border: 0;
    border-radius: 6px;
    background: transparent;
  }

  .branch-option[aria-current] {
    background: var(--s2-gray-100, #f3f3f3);
    font-weight: 600;
  }

  form {
    display: grid;
    gap: 6px;
    margin-top: 10px;
    padding: 10px 4px 0;
    border-top: 1px solid var(--s2-gray-200, #e5e5e5);
  }

  label { font-size: 13px; font-weight: 600; }
  .branch-create, .branch-actions { display: flex; align-items: center; gap: 6px; }
  .branch-actions { flex-wrap: wrap; }

  .branch-actions ::part(action) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    min-height: 32px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    color: inherit;
    background: transparent;
    font: inherit;
    white-space: nowrap;
    cursor: pointer;
  }

  .branch-actions ::part(action):hover:enabled,
  .branch-actions ::part(active-action) {
    background: var(--s2-gray-100, #f3f3f3);
  }

  .branch-actions ::part(action):focus-visible {
    outline: 2px solid var(--s2-blue-900, #385bff);
    outline-offset: 2px;
  }

  .branch-actions ::part(publish-action) {
    color: var(--s2-blue-1000, #244bb1);
    border-color: var(--s2-gray-300, #d5d5d5);
    font-weight: 600;
  }

  .branch-actions ::part(action):disabled {
    color: var(--s2-gray-600, #666);
    opacity: .65;
    cursor: default;
  }

  .branch-actions ::part(action-icon) {
    flex: none;
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  input {
    width: 100%;
    min-width: 0;
    padding: 5px 8px;
    border: 1px solid var(--s2-gray-400, #b8b8b8);
    border-radius: 6px;
    background: var(--s2-gray-25, #fff);
  }

  button[type='submit'] {
    min-height: 32px;
    padding: 0 12px;
    border: 0;
    border-radius: 16px;
    color: #fff;
    background: var(--s2-blue-900, #385bff);
    font-weight: 600;
  }

  button[type='submit']:hover:enabled { background: var(--s2-blue-1000, #244bb1); }
  button[type='submit']:disabled { opacity: .6; }
  p[role='alert'] { margin: 8px 4px 0; color: var(--s2-red-1000, #b1001f); }
`);

export default stylesheet;

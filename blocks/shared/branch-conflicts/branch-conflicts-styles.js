const stylesheet = new CSSStyleSheet();
stylesheet.replaceSync(`
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }

  [popover] {
    position: fixed;
    box-sizing: border-box;
    margin: 0;
    padding: 14px 16px;
    overflow: auto;
    overscroll-behavior: contain;
    color: var(--s2-gray-900, #242424);
    background: var(--s2-gray-25, #fff);
    border: 1px solid var(--s2-gray-300, #d5d5d5);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 16%);
    font: 400 14px/20px var(--s2-font-family, system-ui, sans-serif);
  }

  .panel {
    inset: var(--branch-panel-top, 12px) 12px auto auto;
    max-height: min(680px, calc(100dvh - var(--branch-panel-top, 12px) - 12px));
  }

  .confirmation { width: min(440px, calc(100vw - 24px)); }
  .session { width: min(800px, calc(100vw - 24px)); }
  .notice { inset: auto 16px 16px auto; width: min(360px, calc(100vw - 32px)); }
  .notice:has(.dismiss) { padding-inline-end: 48px; }
  .notice .dismiss { position: absolute; inset: 8px 8px auto auto; width: 28px; padding: 0; font-size: 19px; }

  h3, h4, p { margin: 0; }
  h3 { margin-bottom: 8px; font-size: 16px; }
  h4 { margin: 12px 0 6px; overflow-wrap: anywhere; }
  p { overflow-wrap: anywhere; }
  .description, .progress { color: var(--s2-gray-700, #5c5c5c); }
  .panel [role='status'], .error { margin-block: 6px; }
  .error { color: var(--s2-red-1000, #b1001f); }

  [popover] button {
    min-height: 32px;
    padding: 3px 10px;
    border: 1px solid var(--s2-gray-300, #d5d5d5);
    border-radius: 8px;
    color: inherit;
    background: transparent;
    font: inherit;
    cursor: pointer;
  }

  [popover] button:not([aria-pressed='true']):hover:enabled { background: var(--s2-gray-100, #f3f3f3); }
  [popover] button:focus-visible { outline: 2px solid var(--s2-blue-900, #385bff); outline-offset: 2px; }
  [popover] button:disabled { opacity: .6; cursor: default; }
  [popover] .primary { color: #fff; background: var(--s2-blue-900, #385bff); border-color: transparent; }
  [popover] button.primary:hover:enabled { background: var(--s2-blue-1000, #244bb1); }
  .notice button:not(.dismiss) { margin-top: 8px; }
  footer, .choices { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .resolution-choice { display: inline-flex; align-items: center; gap: 6px; }
  .resolution-choice svg {
    flex: none;
    visibility: hidden;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .resolution-choice[aria-pressed='true'] {
    color: var(--s2-blue-1000, #244bb1);
    border-color: var(--s2-blue-600, #6482d9);
    background: var(--s2-blue-100, #edf2ff);
  }

  .resolution-choice[aria-pressed='true'] svg { visibility: visible; }
  footer { justify-content: flex-end; padding-top: 12px; border-top: 1px solid var(--s2-gray-200, #e5e5e5); }

  .conflict-list { list-style: none; margin: 8px 0 0; padding: 0; }
  .conflict-list li {
    display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; padding: 4px 0;
  }
  .conflict-list button { max-width: 100%; text-align: start; overflow-wrap: anywhere; }
  .conflict-list button[aria-pressed='true'] { background: var(--s2-blue-100, #edf2ff); }
  .conflict-list span { color: var(--s2-gray-700, #5c5c5c); font-size: 12px; }

  .sides { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 8px; }
  .sides section {
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid var(--s2-gray-200, #e5e5e5);
    border-radius: 8px;
    background: var(--s2-gray-100, #f3f3f3);
  }
  .sides h4 { margin: 0 0 6px; }
  pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
  img { max-width: 100%; max-height: 20rem; }
  label { display: block; margin-top: 12px; }
  .publish-delete { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .publish-delete input { margin: 0; accent-color: var(--s2-blue-900, #385bff); }
  textarea {
    display: block;
    box-sizing: border-box;
    width: 100%;
    min-height: 6rem;
    margin: 4px 0 8px;
    padding: 8px;
    border: 1px solid var(--s2-gray-300, #d5d5d5);
    border-radius: 8px;
    color: inherit;
    background: transparent;
  }
`);

export default stylesheet;

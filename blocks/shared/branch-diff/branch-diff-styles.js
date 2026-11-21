const stylesheet = new CSSStyleSheet();
stylesheet.replaceSync(`
  :host { display: block; min-width: 0; }
  .controls, .controls > div, .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .controls { justify-content: space-between; margin-block: 8px; }
  button {
    min-height: 28px;
    padding: 2px 8px;
    border: 1px solid var(--s2-gray-300, #d5d5d5);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  button[aria-pressed='true'] {
    background: var(--s2-blue-100, #edf2ff);
    border-color: var(--s2-blue-300, #c0cff7);
  }

  button:focus-visible { outline: 2px solid var(--s2-blue-900, #385bff); outline-offset: 2px; }
  .legend, .message { color: var(--s2-gray-700, #5c5c5c); font-size: 13px; }
  .legend { margin-bottom: 8px; }
  .message { margin: 0 0 8px; }
  .diff-body, .source {
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--s2-gray-200, #e5e5e5);
    background: var(--s2-gray-25, #fff);
    border-radius: 8px;
    overflow: auto;
    overflow-wrap: anywhere;
  }

  .diff-body > :first-child, .source h4 { margin-top: 0; }
  .diff-body > :last-child, .source p { margin-bottom: 0; }
  .sources {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
    gap: 8px;
  }

  .source h4 { margin-bottom: 6px; }
  pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 4px 8px; border: 1px solid var(--s2-gray-300, #d5d5d5); }

  /* Match the revision Compare colors and structural change markers. */
  ins.diffins, ins.diffmod, del.diffdel, del.diffmod { padding: 1px 3px; border: 1px solid; border-radius: 3px; }
  ins.diffins, ins.diffmod { background: #e8f5e8; color: #2e7d32; border-color: #a5d6a7; text-decoration: none; }
  del.diffdel, del.diffmod { background: #ffebee; color: #c62828; border-color: #ef9a9a; }
  del.diffmod { background: #fff3e0; color: #a34a00; border-color: #ffcc02; }

  :is(ins.diffins, ins.diffmod, del.diffdel, del.diffmod):has(table) {
    display: block;
    padding-inline-start: 10px;
    margin-block: 4px;
    border-width: 0 0 0 4px;
  }
`);

export default stylesheet;

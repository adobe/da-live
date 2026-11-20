const stylesheet = new CSSStyleSheet();
stylesheet.replaceSync(`
  [popover] {
    position: fixed;
    inset: var(--panel-top, auto) auto var(--panel-bottom, auto) var(--panel-left, auto);
    box-sizing: border-box;
    width: min(720px, calc(100vw - 24px));
    max-height: min(680px, var(--panel-height, calc(100vh - 24px)));
    margin: 0;
    padding: 0;
    overflow: auto;
    overscroll-behavior: contain;
    color: var(--s2-gray-900, #242424);
    background: var(--s2-gray-25, #fff);
    border: 1px solid var(--s2-gray-300, #d5d5d5);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 16%);
    font: 400 14px/20px var(--s2-font-family, system-ui, sans-serif);
  }

  header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--s2-gray-25, #fff);
    border-bottom: 1px solid var(--s2-gray-200, #e5e5e5);
  }

  header > div { flex: 1; min-width: 0; }
  h2, h3, h4, p { margin: 0; }
  h2 { font-size: 16px; }
  header p { margin-top: 2px; overflow-wrap: anywhere; }
  .muted, .kind { color: var(--s2-gray-700, #5c5c5c); }
  .content { display: grid; gap: 12px; padding: 12px 16px 16px; }

  button { box-sizing: border-box; font: inherit; color: inherit; cursor: pointer; }
  button:disabled { opacity: .6; cursor: default; }
  button:focus-visible { outline: 2px solid var(--s2-blue-900, #385bff); outline-offset: -2px; }

  .panel-button {
    min-height: 32px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid var(--s2-gray-300, #d5d5d5);
    background: transparent;
    justify-self: start;
  }

  .close { width: 32px; padding: 0; border-color: transparent; font-size: 22px; }
  .panel-button:hover:enabled, .file:hover { background: var(--s2-gray-100, #f3f3f3); }

  .revision { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .revision > span:not([aria-hidden]) {
    padding: 3px 8px;
    background: var(--s2-gray-100, #f3f3f3);
    border-radius: 6px;
  }

  .revision strong { font-variant-numeric: tabular-nums; }
  .message { padding: 8px 10px; background: var(--s2-gray-100, #f3f3f3); border-radius: 8px; }
  .warning { color: #79500e; background: #fff3da; }
  .error { color: var(--s2-red-1000, #b1001f); }

  .changes-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--s2-gray-300, #d5d5d5);
    border-radius: 8px;
  }

  .changes-list li + li { border-top: 1px solid var(--s2-gray-200, #e5e5e5); }
  .file {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 4px 12px;
    width: 100%;
    padding: 8px 10px;
    text-align: start;
    border: 0;
    background: transparent;
  }

  .file[aria-pressed='true'] { background: var(--s2-blue-100, #edf2ff); }
  .file-path { min-width: 0; overflow-wrap: anywhere; font-weight: 500; }
  .file-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; }
  .kind { text-transform: uppercase; }
  .badge { padding: 0 6px; border-radius: 5px; background: var(--s2-gray-100, #f3f3f3); }
  .badge[data-change] { text-transform: capitalize; }
  .badge[data-change='added'] { color: #14633a; background: #e7f6ec; }
  .badge[data-change='modified'] { color: #234cae; background: #edf2ff; }
  .badge[data-change='deleted'] { color: #a22336; background: #fcecef; }

  .detail h3 { margin-bottom: 8px; overflow-wrap: anywhere; font-size: 14px; }
  .sides { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 8px; }
  .side {
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid var(--s2-gray-200, #e5e5e5);
    border-radius: 8px;
    background: var(--s2-gray-100, #f3f3f3);
  }

  .side h4 { margin-bottom: 6px; font-size: 13px; }
  .side p { overflow-wrap: anywhere; }
  pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
  img { display: block; max-width: 100%; max-height: 20rem; margin-top: 8px; }
`);

export default stylesheet;

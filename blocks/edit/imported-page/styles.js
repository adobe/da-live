export const FRAME_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

export const FRAME_CSS = `
:root { color-scheme: light; }
body { margin: 0; padding: 16px; font: 15px/1.5 system-ui, sans-serif; color: #222; background: #fff; overflow-wrap: anywhere; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; } th, td { border: 1px solid #999; padding: 4px 8px; }
table.aem-franklin-block > thead > tr > th { background: #f3f3f3; }
.aem-component { margin: 12px 0; border: 1px solid #d5d1cc; border-radius: 6px; background: #fff; }
.aem-component--container { border-style: dashed; }
.aem-component:hover, .aem-component:focus-within { border-color: #999; box-shadow: 0 2px 8px #00000014; }
.aem-component__header { padding: 8px 12px; color: #555; background: #f3f3f3; border-bottom: 1px solid transparent; font-size: 10px; }
.aem-component:hover > details > .aem-component__header, .aem-component:focus-within > details > .aem-component__header { color: #222; background: #e8e8e8; border-color: #ccc; }
.aem-component__header:is(summary) { cursor: pointer; }
.aem-component__header:is(summary):focus-visible { outline: 2px solid #666; outline-offset: -2px; }
.aem-component__header p { margin: 0; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
.aem-component__header code { font: 10px/1.4 ui-monospace, monospace; overflow-wrap: anywhere; }
.aem-component__properties { margin: 0; padding: 8px 12px; border-bottom: 1px solid #ccc; display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; font-size: 10px; }
.aem-component__properties dt { font: 600 10px ui-monospace, monospace; }
.aem-component__properties dd { margin: 0; }
.aem-component__content { padding: 8px 12px; font-size: 10px; }
.aem-component__children { margin: 8px 12px 12px 12px; padding-left: 12px; border-left: 1px solid #d5d1cc; }
.aem-component__children .aem-component__children .aem-component__children .aem-component__children .aem-component__children .aem-component__children { margin-left: 0; padding-left: 4px; }
p.aem-empty-page { margin: 12px 0; padding: 12px; border: 1px dashed #777; background: #fff; }
.aem-ref { text-decoration: underline dotted; }
.aem-image-placeholder { display: inline-block; padding: 8px 12px; border: 1px dashed #777; background: #eee; color: #444; }
`;

export const PARENT_CSS = `
.da-imported-page-toolbar { display: flex; justify-content: center; padding: 8px 12px; border-bottom: 1px solid var(--s2-gray-200, #ddd); }
.da-imported-page-segmented { display: inline-flex; align-items: center; padding: var(--s2-spacing-50, 2px); gap: var(--s2-spacing-50, 2px); border-radius: calc(var(--s2-corner-radius-400, 6px) + var(--s2-spacing-50, 2px)); background: var(--s2-gray-100, #eee); }
.da-imported-page-segment { display: inline-flex; align-items: center; justify-content: center; height: 24px; padding: 0 9px; border: 0; border-radius: var(--s2-corner-radius-400, 6px); background: transparent; color: var(--s2-gray-700, #555); font: inherit; font-size: var(--s2-body-size-xs, 12px); font-weight: var(--s2-component-s-medium-font-weight, 600); cursor: pointer; }
.da-imported-page-segment:hover:not(.is-selected) { background: var(--s2-gray-200, #ddd); color: var(--s2-gray-900, #222); }
.da-imported-page-segment.is-selected { background: var(--s2-gray-25, #fff); color: var(--s2-gray-800, #333); }
.da-imported-page-segment:focus-visible { outline: 2px solid var(--s2-blue-800, #0265dc); outline-offset: 1px; }
.da-imported-page { box-sizing: border-box; width: 100%; min-width: 0; max-width: 1200px; margin: 0 auto; padding: 0 24px 48px; }
.da-imported-page iframe { box-sizing: border-box; display: block; width: 100%; height: 75vh; min-height: 400px; border: 2px solid #5258e4; background: #fff; resize: vertical; }
.da-imported-page-references { margin: 16px 0; }
.da-imported-page-references h2 { font-size: 16px; }
.da-imported-page-error { padding: 16px; border: 1px solid #c9252d; }
`;

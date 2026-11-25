export const FRAME_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

export const FRAME_CSS = `
:root { color-scheme: light; }
body { margin: 0; padding: 16px; font: 15px/1.5 system-ui, sans-serif; color: #222; background: #f4f4f4; overflow-wrap: anywhere; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; } th, td { border: 1px solid #999; padding: 4px 8px; }
.aem-component { margin: 12px 0; border: 2px solid #5258e4; border-radius: 6px; background: #fff; }
.aem-component--container { border-style: dashed; border-color: #6e6e6e; }
.aem-component--dynamic, .aem-component--reference { border-color: #b35c00; }
.aem-component__header { padding: 8px 12px; background: #e8e9fb; border-bottom: 2px solid #5258e4; }
.aem-component--dynamic > .aem-component__header, .aem-component--reference > .aem-component__header { background: #ffeccc; }
.aem-component__header p { margin: 0; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
.aem-component__header code { display: block; margin-top: 2px; font: 13px/1.4 ui-monospace, monospace; overflow-wrap: anywhere; }
.aem-component__properties { margin: 0; padding: 8px 12px; border-bottom: 1px solid #ccc; display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; }
.aem-component__properties::before { content: "Configuration"; grid-column: 1 / -1; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #444; }
.aem-component__properties dt { font: 600 13px ui-monospace, monospace; }
.aem-component__properties dd { margin: 0; }
.aem-component__content { padding: 8px 12px; }
.aem-component__content::before { content: "Authored content"; display: block; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #444; }
.aem-component__children { margin: 8px 12px 12px 12px; padding-left: 12px; border-left: 4px solid #5258e4; }
.aem-component__children::before { content: "Child components"; display: block; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #444; }
.aem-component__children .aem-component__children .aem-component__children .aem-component__children .aem-component__children .aem-component__children { margin-left: 0; padding-left: 4px; }
p.aem-empty-page { margin: 12px 0; padding: 12px; border: 1px dashed #777; background: #fff; }
.aem-ref { text-decoration: underline dotted; }
.aem-image-placeholder { display: inline-block; padding: 8px 12px; border: 1px dashed #777; background: #eee; color: #444; }
`;

export const PARENT_CSS = `
da-imported-page-banner, .da-imported-page-banner { display: block; }
.da-imported-page-banner { margin: 0 0 12px; padding: 10px 16px; background: #1f1f5c; color: #fff; font-weight: 700; border-left: 8px solid #b35c00; }
.da-imported-page { box-sizing: border-box; width: 100%; min-width: 0; max-width: 1200px; margin: 0 auto; padding: 0 24px 48px; }
.da-imported-page iframe { box-sizing: border-box; display: block; width: 100%; height: 75vh; min-height: 400px; border: 2px solid #5258e4; background: #fff; resize: vertical; }
.da-imported-page-references { margin: 16px 0; }
.da-imported-page-references h2 { font-size: 16px; }
.da-imported-page-error { padding: 16px; border: 1px solid #c9252d; }
`;

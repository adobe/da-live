// Local NX rail only: real registered DA tool-panel content is mounted unchanged.
export const PANEL_EVENT = Object.freeze({ CLOSE: 'nx-panel-close', OPEN: 'nx-panel-open' });
const sections = new Map();
const rails = new Map();
export const wasPanelOpen = (section) => !!rails.get(section) && !rails.get(section).hidden;
export const getSectionAtPosition = () => undefined;
export function registerPanelSection(section, options) { sections.set(section, options); }
export function setPanelMocks() {}

document.addEventListener(PANEL_EVENT.OPEN, async ({ detail }) => {
  const section = sections.get(detail?.section);
  if (!section) return;
  let rail = rails.get(detail.section);
  if (!rail) {
    rail = document.createElement('aside');
    rail.className = 'panel';
    rail.dataset.section = detail.section;
    document.body.append(rail);
    rails.set(detail.section, rail);
    rail.append(await section.getContent());
  }
  rail.hidden = false;
  await section.onShow?.(rail, detail.id, detail.options);
});

document.addEventListener(PANEL_EVENT.CLOSE, ({ detail }) => {
  const rail = rails.get(detail?.section);
  if (rail) rail.hidden = true;
});

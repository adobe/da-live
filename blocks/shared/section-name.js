import { ySyncPluginKey, yUndoPluginKey } from 'da-y-wrapper';

export const FIRST_SECTION_NAME_KEY = 'first-section-name';

let mdMap;
let unbindPrevious;

export function getFirstSectionName() {
  return mdMap?.get(FIRST_SECTION_NAME_KEY) ?? null;
}

export function setFirstSectionName(name) {
  if (!mdMap) return;
  const next = name || null;
  if (next === getFirstSectionName()) return;
  mdMap.doc.transact(() => {
    if (next) mdMap.set(FIRST_SECTION_NAME_KEY, next);
    else mdMap.delete(FIRST_SECTION_NAME_KEY);
  }, ySyncPluginKey);
}

export function bindFirstSectionName(ydoc, view, onChange) {
  unbindPrevious?.();

  const map = ydoc.getMap('daMetadata');
  mdMap = map;
  yUndoPluginKey.getState(view.state)?.undoManager?.addToScope(map);

  const apply = () => {
    const name = map.get(FIRST_SECTION_NAME_KEY);
    if (name) view.dom.dataset.sectionName = name;
    else delete view.dom.dataset.sectionName;
  };
  apply();

  const observer = (event) => {
    if (!event.keysChanged.has(FIRST_SECTION_NAME_KEY)) return;
    apply();
    onChange?.();
  };
  map.observe(observer);

  const unbind = () => {
    map.unobserve(observer);
    if (mdMap === map) mdMap = undefined;
    if (unbindPrevious === unbind) unbindPrevious = undefined;
  };
  unbindPrevious = unbind;
  return unbind;
}

export const modifierCalls = [];
export const applySiteImageModifiers = (src, modifiers) => {
  modifierCalls.push({ src, modifiers });
  return src;
};

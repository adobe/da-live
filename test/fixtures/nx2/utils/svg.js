// Test fixture mirroring nx2/utils/svg.js. Sprites are not served in tests,
// so every lookup resolves to null like a failed fetch in the real module.
export const loadHrefSvg = async () => null;

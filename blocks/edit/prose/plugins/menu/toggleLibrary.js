let libraryMod;

/**
 * A lazy library toggle wrapper
 */
const toggleLibrary = async ({ toggle = true } = {}) => {
  libraryMod ??= await import('../../../da-library/da-library.js');
  // Only toggle if asked
  if (!toggle) return;
  libraryMod.default();
};

export default toggleLibrary;

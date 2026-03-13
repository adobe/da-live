let libraryModLoading;

/**
 * A lazy library toggle wrapper
 */
const toggleLibrary = async ({ toggle = true } = {}) => {
  libraryModLoading ??= import('../../../da-library/da-library.js');
  // Only toggle if asked
  if (!toggle) return;
  const mod = await libraryModLoading;
  mod.default();
};

export default toggleLibrary;

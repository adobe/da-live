// Stand-in for da-nx's public localization SDK (nx/public/loc/index.js), which
// replaced mergeCopy in nx/blocks/loc/project/index.js (adobe/da-nx#801).
// eslint-disable-next-line import/prefer-default-export
export const mergeCopy = async (options) => {
  window.locMergeCalls = [...(window.locMergeCalls || []), options];
  return { ok: true, status: 200 };
};

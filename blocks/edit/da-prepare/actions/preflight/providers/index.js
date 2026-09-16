// Single source of truth for "which providers ship by default", so the two places that
// mount Preflight (canvas prepare-menu.js and classic-editor da-prepare.js) don't each
// keep their own copy of this list.
const DEFAULT_PROVIDER_MODULES = [
  './ootb.js',
];

export async function loadDefaultPreflightProviders() {
  await Promise.all(DEFAULT_PROVIDER_MODULES.map((path) => import(path)));
}

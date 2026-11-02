// The one map of the config UI: primary tab → section → icon, scope, storage and panel. Moving,
// renaming, re-scoping or re-homing a section happens here; panels only describe their fields.
//
// `icon`: img/<icon>.svg, a currentColor sprite with id="icon" (named for what it shows).
// `scopes`: org-only (#/org), site-only (#/org/site), or both (site values override org).
// `store`: where the values live: config(sheet), file(path, sheets) or library(title, paths);
// see stores.js. `docs`: the aem.live page the panel links to. A section id is also its `?tab=`
// value.

import { SHEETS } from './sheets.js';
import { config, file, library } from './stores.js';
import aemAssets from './panels/aem-assets.js';
import apps from './panels/apps.js';
import experienceWorkspace from './panels/experience-workspace.js';
import { blocks, templates, icons, placeholders } from './panels/library.js';
import msm from './panels/msm.js';
import plugins from './panels/plugins.js';
import prepare from './panels/prepare.js';
import translation from './panels/translation.js';

export const ORG = 'org';
export const SITE = 'site';
const BOTH = [ORG, SITE];

export const TABS = [
  {
    id: 'library',
    label: 'Library',
    sections: [
      {
        id: 'blocks',
        label: 'Blocks',
        icon: 'box',
        scopes: [SITE],
        store: library('Blocks'),
        docs: 'https://www.aem.live/docs/ew/administering/set-up-library',
        panel: blocks,
      },
      {
        id: 'templates',
        label: 'Templates',
        icon: 'file-template',
        scopes: [SITE],
        store: library('Templates'),
        docs: 'https://www.aem.live/docs/ew/administering/set-up-library',
        panel: templates,
      },
      {
        id: 'icons',
        label: 'Icons',
        icon: 'image',
        scopes: [SITE],
        store: library('Icons'),
        docs: 'https://www.aem.live/docs/ew/administering/set-up-library',
        panel: icons,
      },
      {
        id: 'placeholders',
        label: 'Placeholders',
        icon: 'variable',
        scopes: [SITE],
        store: library('Placeholders', ['/placeholders.json']),
        docs: 'https://www.aem.live/docs/placeholders',
        panel: placeholders,
      },
    ],
  },
  {
    id: 'extensions',
    label: 'Extensions',
    sections: [
      {
        id: 'plugins',
        label: 'Plugins',
        icon: 'plug',
        scopes: BOTH,
        store: config(SHEETS.library),
        docs: 'https://www.aem.live/docs/ew/developing/micro-frontends/2-build-your-basic-plugin',
        panel: plugins,
      },
      {
        id: 'apps',
        label: 'Apps',
        icon: 'app',
        scopes: [SITE],
        store: config(SHEETS.apps, { inherit: false }),
        docs: 'https://www.aem.live/docs/ew/developing/micro-frontends/4-build-your-audit-app',
        panel: apps,
      },
      {
        id: 'prepare',
        label: 'Prepare',
        icon: 'menu',
        scopes: BOTH,
        store: config(SHEETS.prepare),
        docs: 'https://www.aem.live/docs/ew/administering/prepare-menu',
        panel: prepare,
      },
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    sections: [
      {
        id: 'experience-workspace',
        label: 'Experience Workspace',
        icon: 'edit',
        scopes: BOTH,
        store: config(SHEETS.flags),
        docs: 'https://www.aem.live/docs/ew/da-is-ew',
        panel: experienceWorkspace,
      },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    sections: [
      {
        id: 'aem-assets',
        label: 'AEM Assets',
        icon: 'asset',
        scopes: BOTH,
        store: config(SHEETS.data),
        docs: 'https://www.aem.live/docs/ew/administering/set-up-aem-assets',
        panel: aemAssets,
      },
      {
        id: 'translation',
        label: 'Translation',
        icon: 'globe',
        scopes: [SITE],
        store: file('/.da/translate.json', {
          settings: 'config',
          options: 'config',
          languages: 'languages',
          'custom-doc-rules': 'custom-doc-rules',
          'dnt-content-rules': 'dnt-content-rules',
          'dnt-sheet-rules': 'dnt-sheet-rules',
          dnt: 'dnt',
        }),
        docs: 'https://www.aem.live/docs/ew/administering/translation-config',
        panel: translation,
      },
    ],
  },
  {
    id: 'multi-site',
    label: 'Multi-site',
    sections: [
      {
        id: 'msm',
        label: 'Multi-Site Manager',
        icon: 'branch',
        scopes: [ORG],
        store: config(SHEETS.msm),
        docs: 'https://www.aem.live/docs/ew/administering/multi-site-manager',
        panel: msm,
      },
    ],
  },
];

export const SECTIONS = TABS.flatMap((tab) => tab.sections);

export const sectionById = (id) => SECTIONS.find((section) => section.id === id) ?? null;

export function tabsForScope(scope) {
  return TABS
    .map((tab) => ({ ...tab, sections: tab.sections.filter((s) => s.scopes.includes(scope)) }))
    .filter((tab) => tab.sections.length > 0);
}

// The first visible section when `sectionId` is unset, unknown or not shown in this scope (e.g.
// a site-only section after switching to the org).
export function resolveSelection(tabs, sectionId) {
  const tab = tabs.find((t) => t.sections.some((s) => s.id === sectionId));
  if (tab) return { tab, section: tab.sections.find((s) => s.id === sectionId) };
  const [first] = tabs;
  return { tab: first ?? null, section: first?.sections[0] ?? null };
}

// The active section lives in `?tab=` so the hash stays strictly `#/org/site`.
export function tabFromUrl(href) {
  return new URL(href).searchParams.get('tab');
}

export function urlWithTab(href, sectionId) {
  const url = new URL(href);
  url.searchParams.set('tab', sectionId);
  return url.toString();
}

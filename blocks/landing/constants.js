export const PLACEHOLDER_TILES = [
  {
    title: 'Authoring',
    description: 'Everything an author touches day to day — library, import, plugins, schema',
    iconHref: '/img/icons/s2-icon-edit-20-n.svg',
    tone: 'green',
  },
  {
    title: 'Publishing & Workflow',
    description: 'Preflight, scheduled publishing, and multi-step review before content goes live',
    iconHref: '/img/icons/s2-icon-publish-20-n.svg',
    tone: 'orange',
  },
  {
    title: 'Localization & Multi-site',
    description: 'Translate, roll out to markets, and manage base/satellite site inheritance',
    iconHref: new URL('./report-suite-mapping.svg', import.meta.url).href,
    tone: 'purple',
  },
  {
    title: 'Governance & Operation',
    description: 'Snapshots, recovery, platform limits, and the operational tooling for resilience',
    iconHref: new URL('./ribbon-checkmark.svg', import.meta.url).href,
    tone: 'pink',
  },
  {
    title: 'Develop & Extend',
    description: 'Build custom fullscreen apps, library plugins, and automate via the Admin API',
    iconHref: new URL('./data-streams.svg', import.meta.url).href,
  },
];

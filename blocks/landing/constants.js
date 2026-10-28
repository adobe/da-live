export const DOC_TILES = [
  {
    id: 'publishing',
    title: 'Publishing & Workflow',
    description: 'Preflight, scheduled publishing, and multi-step review before content goes live',
    iconHref: '/img/icons/s2-icon-publish-20-n.svg',
    tone: 'orange',
    href: 'https://www.aem.live/docs/ew/authoring/publishing',
  },
  {
    id: 'localization',
    title: 'Localization & Multi-site',
    description: 'Translate, roll out to markets, and manage base/satellite site inheritance',
    iconHref: new URL('./report-suite-mapping.svg', import.meta.url).href,
    tone: 'purple',
    href: 'https://www.aem.live/docs/ew/administering/multi-site-manager',
  },
  {
    id: 'develop',
    title: 'Develop & Extend',
    description: 'Build custom fullscreen apps, library plugins, and automate via the Admin API',
    iconHref: new URL('./data-streams.svg', import.meta.url).href,
    href: 'https://www.aem.live/developer/tutorial',
  },
];

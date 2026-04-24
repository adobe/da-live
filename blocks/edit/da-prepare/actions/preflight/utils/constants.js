import { t } from '../../../../../shared/i18n.js';

export const CATEGORIES = ['References', 'Content', 'SEO'];
export const CATEGORY_LABEL_KEYS = {
  References: 'edit.preflight.category.references',
  Content: 'edit.preflight.category.content',
  SEO: 'edit.preflight.category.seo',
};
export const CHECK_LABEL_KEYS = {
  Links: 'edit.preflight.check.links',
  Fragments: 'edit.preflight.check.fragments',
  'H1 count': 'edit.preflight.check.h1',
  'Lorem ipsum': 'edit.preflight.check.lorem',
  Title: 'edit.preflight.check.title',
  Description: 'edit.preflight.check.description',
};

export const ICONS = new Map([
  ['success', 'blocks/edit/img/S2_Icon_CheckmarkCircle_20_N.svg#S2_Icon_CheckmarkCircle'],
  ['info', '/blocks/edit/img/S2_Icon_InfoCircle_20_N.svg#S2_Icon_InfoCircle'],
  ['warn', '/blocks/edit/img/S2_Icon_AlertTriangle_20_N.svg#S2_Icon_AlertTriangle'],
  ['error', '/blocks/edit/img/S2_Icon_AlertDiamond_20_N.svg#S2_Icon_AlertDiamond'],
  ['more', '/blocks/edit/img/S2_Icon_More_20_N.svg#S2_Icon_More'],
]);

export const REASONS = {
  'h1.info': { badge: 'info', get reason() { return t('edit.preflight.reason.h1.one'); } },
  'h1.warn': { badge: 'warn', get reason() { return t('edit.preflight.reason.h1.many'); } },
  'h1.error': { badge: 'error', get reason() { return t('edit.preflight.reason.h1.none'); } },
  'lorem.info': { badge: 'info', get reason() { return t('edit.preflight.reason.lorem.clean'); } },
  'lorem.error': { badge: 'error', get reason() { return t('edit.preflight.reason.lorem.found'); } },
  'title.info.meta': { badge: 'info', get reason() { return t('edit.preflight.reason.title.present'); } },
  'title.info.h1': { badge: 'info', get reason() { return t('edit.preflight.reason.title.present'); } },
  'title.error': { badge: 'error', get reason() { return t('edit.preflight.reason.title.missing'); } },
  'title.warn': { badge: 'warn', get reason() { return t('edit.preflight.reason.title.missing'); } },
  'description.info.meta': { badge: 'info', get reason() { return t('edit.preflight.reason.description.present'); } },
  'description.info.para': { badge: 'info', get reason() { return t('edit.preflight.reason.description.present'); } },
  'description.warn': { badge: 'warn', get reason() { return t('edit.preflight.reason.description.missing'); } },
  'link.working': { badge: 'info', get reason() { return t('edit.preflight.reason.links.ok'); } },
  'link.success': { badge: 'success', get reason() { return t('edit.preflight.reason.links.ok'); } },
  'link.warn': { badge: 'warn', get reason() { return t('edit.preflight.reason.links.broken'); } },
  'link.error': { badge: 'error', get reason() { return t('edit.preflight.reason.links.broken'); } },
};

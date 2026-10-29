import { fetchDaConfigs, getFirstSheet } from '../../../shared/utils.js';
import { getAppUrl, getSiteUrl, parseSiteUrl, toSiteUrl } from '../../../../scripts/urls.js';

async function getConfSheet(org, site) {
  const configs = await Promise.all(fetchDaConfigs({ org, site }));
  const rows = configs.filter(Boolean).reverse().flatMap((c) => getFirstSheet(c) || []);
  return rows.length ? rows : null;
}

export async function getUeUrl(ueConf, previewUrl) {
  const UE_PREFIX = 'https://experience.adobe.com/#/{{DX_ORG}}/aem/editor/canvas/';
  const { value } = ueConf;
  if (!value) return null;
  const dxOrg = value.split('/').find((split) => split.startsWith('@'));
  if (!dxOrg) return null;
  const prefix = UE_PREFIX.replace('{{DX_ORG}}', dxOrg);
  const details = parseSiteUrl(previewUrl);
  const tier = window.location.origin === getAppUrl('', true) || details?.tier === 'preview' ? 'uePage' : 'ue';
  const target = details ? getSiteUrl(tier, { ...details, path: details.pathname }) : previewUrl;
  const ueDomain = target.replace(/^https?:\/\//, '');
  return `${prefix}${ueDomain}`;
}

export async function getQeUrl(previewUrl) {
  const url = new URL(toSiteUrl(previewUrl, 'preview'));
  url.pathname = url.pathname.replace(/\/index$/, '/');
  url.searchParams.set('quick-edit', 'on');
  return url.href;
}

export default async function getExternalUrl(org, repo, previewUrl) {
  const confSheet = await getConfSheet(org, repo);
  const qeConf = confSheet?.find((row) => row.key === 'quick-edit' && row.value.split(',').find((split) => split.startsWith(repo)));
  if (qeConf) return getQeUrl(previewUrl);
  const ueConf = confSheet?.find((row) => row.key === 'editor.path');
  if (ueConf) return getUeUrl(ueConf, previewUrl);
  return null;
}

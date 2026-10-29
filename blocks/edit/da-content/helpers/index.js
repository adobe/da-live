import { fetchDaConfigs, getFirstSheet } from '../../../shared/utils.js';
import config, { getAemHosts, toAemHost } from '../../../../scripts/config.js';

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
  const url = new URL(previewUrl);
  const domain = window.location.origin === `https://${config.da.pageDomain}`
    || url.hostname.endsWith(`.${config.aem.previewHost}`)
    ? config.da.pageDomain : config.da.domain;
  const host = getAemHosts().find((suffix) => url.hostname.endsWith(`.${suffix}`));
  if (host) url.hostname = `${url.hostname.slice(0, -host.length)}ue.${domain}`;
  const ueDomain = url.href.replace('https://', '');
  return `${prefix}${ueDomain}`;
}

export async function getQeUrl(previewUrl) {
  const url = new URL(previewUrl);
  url.hostname = toAemHost(url.hostname, config.aem.previewHost);
  const finalUrl = url.href.replace(/\/index$/, '/');
  return `${finalUrl}?quick-edit=on`;
}

export default async function getExternalUrl(org, repo, previewUrl) {
  const confSheet = await getConfSheet(org, repo);
  const qeConf = confSheet?.find((row) => row.key === 'quick-edit' && row.value.split(',').find((split) => split.startsWith(repo)));
  if (qeConf) return getQeUrl(previewUrl);
  const ueConf = confSheet?.find((row) => row.key === 'editor.path');
  if (ueConf) return getUeUrl(ueConf, previewUrl);
  return null;
}

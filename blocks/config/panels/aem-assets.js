// AEM Assets keys of the `data` sheet, as documented (see sections.js), plus the one flag
// da-nx reads from the `flags` sheet (nx2/utils/aem-assets/repository-config.js).

import { VALIDATION } from '../messages.js';
import { SHEETS } from '../sheets.js';

const HOST_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;
// The editor only knows these renditions; anything else silently falls back to original.
const MIME_PAIR_RE = /^[\w.+*-]+\/[\w.+*-]+\s*:\s*(avif|play|original)$/i;

// `off` isn't documented, but anything other than `on` turns these off, so a site can
// override an org `on`.
const ON_OFF = [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }];

export function validateRepositoryId(value) {
  return /^(author|delivery)-p\d+-e\d+\.adobeaemcloud\.com$/.test(value)
    ? null : VALIDATION.aemAssets.repositoryId;
}

export function validateHost(value) {
  if (/^https?:\/\//i.test(value)) return VALIDATION.aemAssets.hostOnly;
  return HOST_RE.test(value) ? null : VALIDATION.aemAssets.host;
}

// The editor adds the leading slash itself, so both /adobe/assets and adobe/assets work.
export function validateBasePath(value) {
  if (/:\/\/|\s/.test(value)) return VALIDATION.aemAssets.pathOnly;
  return null;
}

// As da-nx applies them: a query string (leading `?` optional) of name=value pairs, not a URL.
export function validateImageModifiers(value) {
  const query = value.replace(/^\?/, '');
  return !query.includes('://') && /^[^=&\s]+=[^&\s]*(&[^=&\s]+=[^&\s]*)*$/.test(query)
    ? null : VALIDATION.aemAssets.imageModifiers;
}

export function validateMimeRenditions(value) {
  const ok = value.split(',').every((pair) => MIME_PAIR_RE.test(pair.trim()));
  return ok ? null : VALIDATION.aemAssets.mimeRenditions;
}

export default {
  description: 'Let authors browse and insert images and videos from AEM Assets or Dynamic Media.',
  fields: [
    {
      key: 'aem.repositoryId',
      label: 'Repository ID',
      hint: 'Host of the AEM Assets repository. Its author- or delivery- prefix selects the mode.',
      placeholder: 'author-p12345-e67890.adobeaemcloud.com',
      required: true,
      validate: validateRepositoryId,
    },
    {
      key: 'aem.assets.prod.origin',
      label: 'Production origin',
      hint: 'Overrides the host used in asset URLs. A delivery- host also turns on Dynamic Media delivery.',
      placeholder: 'assets.example.com',
      validate: validateHost,
    },
    {
      key: 'aem.assets.prod.basepath',
      label: 'Production base path',
      hint: 'Base path for Dynamic Media and delivery URLs.',
      placeholder: '/adobe/assets',
      validate: validateBasePath,
    },
    {
      key: 'aem.assets.image.type',
      label: 'Insert images as',
      hint: 'Insert images as links instead of image tags, e.g. for Dynamic Media URLs that must bypass Media Bus.',
      // Anything other than `link` inserts an image tag, so `image` lets a site
      // override an org `link`.
      options: [{ value: 'link', label: 'Link' }, { value: 'image', label: 'Image' }],
      emptyLabel: 'Default (image)',
    },
    {
      key: 'aem.assets.image.linkAsImage',
      sheet: SHEETS.flags,
      label: 'Edit linked images as images',
      hint: 'With images inserted as links, authors still see and edit them as images; they publish as links.',
      // Only `true` turns it on, so `false` lets a site override an org `true`.
      options: [{ value: 'true', label: 'On' }, { value: 'false', label: 'Off' }],
      emptyLabel: 'Default (off)',
    },
    {
      key: 'aem.asset.dm.delivery',
      label: 'Dynamic Media delivery',
      hint: 'Browse the author tier but build Dynamic Media delivery URLs.',
      options: ON_OFF,
      emptyLabel: 'Default (off)',
    },
    {
      key: 'aem.asset.smartcrop.select',
      label: 'Smart Crop selection',
      hint: 'Let authors pick Smart Crops. Implies Dynamic Media delivery.',
      options: ON_OFF,
      emptyLabel: 'Default (off)',
    },
    {
      key: 'aem.asset.dm.approvedonly',
      label: 'Approved assets only',
      hint: 'With Dynamic Media on the author tier, show authors approved assets only. Off shows all assets.',
      // On unless `off`, and only on the author tier with Dynamic Media.
      options: ON_OFF,
      emptyLabel: 'Default (on)',
    },
    {
      key: 'aem.asset.mime.renditions',
      label: 'MIME renditions',
      hint: 'Comma-separated mimetype:rendition overrides (avif, play or original). Defaults: images avif, videos play, others original.',
      placeholder: 'image/vnd.adobe.photoshop:avif, video/*:original',
      validate: validateMimeRenditions,
    },
    {
      key: 'aem.asset.image.modifiers',
      label: 'Image modifiers',
      hint: 'Query parameters added to AEM Assets delivery image URLs. Parameters already on an image URL win.',
      placeholder: 'quality=85&width=1200',
      validate: validateImageModifiers,
    },
  ],
};

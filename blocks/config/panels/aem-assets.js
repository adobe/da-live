// AEM Assets keys of the `data` sheet, as documented (see sections.js).

import { VALIDATION } from '../messages.js';

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

export function validateMimeRenditions(value) {
  const ok = value.split(',').every((pair) => MIME_PAIR_RE.test(pair.trim()));
  return ok ? null : VALIDATION.aemAssets.mimeRenditions;
}

export default {
  description: 'Connect authors to AEM Assets or Dynamic Media so they can browse, select and insert assets.',
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
      key: 'aem.asset.mime.renditions',
      label: 'MIME renditions',
      hint: 'Comma-separated mimetype:rendition overrides (avif, play or original). Defaults: images avif, videos play, others original.',
      placeholder: 'image/vnd.adobe.photoshop:avif, video/*:original',
      validate: validateMimeRenditions,
    },
  ],
};

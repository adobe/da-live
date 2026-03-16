const RENDITION_REL = 'http://ns.adobe.com/adobecloud/rel/rendition';

/**
 * Author tier, no DM delivery.
 * Asset response includes asset.path and _links renditions.
 */
export function buildAuthorUrl(asset, publishOrigin) {
  const mimetype = asset.mimetype || asset['dc:format'] || '';
  if (mimetype.startsWith('video/')) {
    // eslint-disable-next-line no-underscore-dangle
    const renditionLinks = asset._links?.[RENDITION_REL];
    const videoLink = renditionLinks?.find((link) => link.href.endsWith('/play'))?.href;
    return videoLink || `https://${publishOrigin}${asset.path}`;
  }
  return `https://${publishOrigin}${asset.path}`;
}

/**
 * Author tier + DM delivery enabled.
 * Browses via author but constructs DM-style delivery URLs using repo:id.
 * URL format per AEM docs:
 *   Images:  https://<host>/adobe/assets/<id>/as/<seo-name>.<format>
 *   Video:   https://<host>/adobe/assets/<id>/play
 *   Other:   https://<host>/adobe/assets/<id>/original/as/<name>
 *            (PDFs, CSVs, documents — use the original rendition path)
 */
export function buildDmUrl(asset, host) {
  const mimetype = asset.mimetype || asset['dc:format'] || '';
  const base = `https://${host}/adobe/assets/${asset['repo:id']}`;

  if (mimetype.startsWith('image/')) {
    const seoName = asset.name.includes('.')
      ? asset.name.split('.').slice(0, -1).join('.')
      : asset.name;
    return `${base}/as/${seoName}.avif`;
  }

  if (mimetype.startsWith('video/')) {
    return `${base}/play`;
  }

  return `${base}/original/as/${asset.name}`;
}

/**
 * Delivery tier (DM Open API).
 * Asset response uses repo:assetId, repo:repositoryId, repo:name.
 * Folder structure is not available (flat listing).
 *
 * URL format per AEM docs:
 *   Images:  https://<host>/adobe/assets/<id>/as/<seo-name>.<format>
 *   Video:   https://<host>/adobe/assets/<id>/play
 *   Other:   https://<host>/adobe/assets/<id>/original/as/<name>
 *            (PDFs, CSVs, documents — use the original rendition path)
 */
export function buildDeliveryUrl(asset, overrideHost) {
  const host = overrideHost || asset['repo:repositoryId'];
  const assetId = asset['repo:assetId'];
  const fullName = asset['repo:name'] || '';
  const mimetype = asset.mimetype || asset['dc:format'] || '';
  const base = `https://${host}/adobe/assets/${assetId}`;

  if (mimetype.startsWith('image/')) {
    // seoName is the filename without extension per the AEM Open API spec
    const seoName = fullName.includes('.')
      ? fullName.split('.').slice(0, -1).join('.')
      : fullName;
    return `${base}/as/${seoName}.avif`;
  }

  if (mimetype.startsWith('video/')) {
    return `${base}/play`;
  }

  // PDFs, CSVs, documents, and any other non-image/non-video formats
  return `${base}/original/as/${fullName}`;
}

/**
 * Returns the smart crop URL for a given crop name.
 * Used when aem.asset.smartcrop.select is enabled.
 */
export function buildSmartCropUrl(asset, dmOrigin, cropName) {
  const base = `https://${dmOrigin}/adobe/assets/${asset['repo:id']}`;
  const seoName = asset.name.includes('.')
    ? asset.name.split('.').slice(0, -1).join('.')
    : asset.name;
  return `${base}/as/${cropName}-${seoName}.avif?smartcrop=${cropName}`;
}

/**
 * Returns the base DM URL for fetching smart crops list.
 */
export function buildSmartCropsListUrl(asset, dmOrigin) {
  return `https://${dmOrigin}/adobe/assets/${asset['repo:id']}/smartCrops`;
}

/**
 * Returns the alt text for an asset from the _embedded metadata (author tier).
 */
export function getAssetAlt(asset) {
  // eslint-disable-next-line no-underscore-dangle
  const meta = asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset'];
  return meta?.['dc:description'] || meta?.['dc:title'] || '';
}

/**
 * Returns the DM asset approval status from author-tier _embedded metadata.
 * Used to block insertion of unapproved assets when DM delivery is enabled.
 */
export function getDmApprovalStatus(asset) {
  // eslint-disable-next-line no-underscore-dangle
  const meta = asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset'];
  return {
    status: meta?.['dam:assetStatus'],
    activationTarget: meta?.['dam:activationTarget'],
  };
}

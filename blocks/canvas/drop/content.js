import { DOMParser as PMDOMParser, Slice } from 'da-y-wrapper';
import { getNx2, getNx2Api } from '../../../scripts/utils.js';
import { refuseOversizedImage } from '../utils/image-upload.js';

/**
 * Upload context for files: `parent` is `/org/site/dir`, `name` is the page name
 * without extension; media is stored under `${parent}/.${name}/`.
 */
export function uploadContext({ org, site, path }) {
  const clean = (path || '').replace(/^\//, '').replace(/\.html?$/i, '');
  const pagePath = !clean || clean.endsWith('/') ? `${clean}index` : clean;
  const parts = pagePath.split('/');
  const name = parts.pop();
  return { org, site, parent: `/${[org, site, ...parts].join('/')}`, name };
}

function preload(src) {
  // a media bus src is relative to the published page and cannot load from here
  if (src.startsWith('./media_')) return Promise.resolve();
  return new Promise((resolve) => {
    const img = document.createElement('img');
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
    img.src = src;
  });
}

/** @returns {Promise<{ src } | { error }>} */
export async function uploadFile({ file, context }) {
  if (!context?.parent || !context?.name) return { error: 'unavailable' };
  if (await refuseOversizedImage(file.size, context.parent)) return { error: 'image-too-large' };
  const { source } = await getNx2Api();
  const resp = await source.uploadMedia(`${context.parent}/.${context.name}/${file.name}`, { body: file });
  if (!resp.ok) return { error: 'upload-failed', status: resp.status };
  // the media bus is content addressed, so the src is only known from the response
  const { source: { contentUrl } } = await resp.json();
  await preload(contentUrl);
  return { src: contentUrl };
}

export function parseHtml({ schema, html }) {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const parsed = PMDOMParser.fromSchema(schema).parse(dom.body);
  return parsed.content.size ? new Slice(parsed.content, 0, 0) : null;
}

let assetModules;
function loadAssetModules() {
  assetModules ??= Promise.all([
    import(`${getNx2()}/utils/aem-assets/repository-config.js`),
    import(`${getNx2()}/utils/aem-assets/selection.js`),
  ]);
  return assetModules;
}

/**
 * Resolves assets against the site's AEM Assets config into image or link nodes.
 * @returns {Promise<{ nodes, message? } | { error }>}
 */
export async function resolveAssets({ schema, assets, context }) {
  const [{ getRepositoryConfig }, { resolveAssetSelection, MISSING_FORMAT_ERROR_MSG }] = (
    await loadAssetModules()
  );
  const repoConfig = context?.org && context?.site
    ? await getRepositoryConfig(context.org, context.site) : null;
  if (!repoConfig) return { error: 'not-configured' };

  const nodes = [];
  const errors = [];
  let rejected = 0;
  assets.forEach((asset) => {
    const selection = resolveAssetSelection({ asset, repoConfig });
    if (selection.error === MISSING_FORMAT_ERROR_MSG) return;
    if (selection.error) {
      rejected += 1;
      if (!errors.includes(selection.error)) errors.push(selection.error);
      return;
    }
    const { href, isImage, alt } = selection;
    if (isImage && !repoConfig.insertAsLink) {
      nodes.push(schema.nodes.image.create({ src: href, style: 'width: 180px', ...(alt && { alt }) }));
      return;
    }
    const prev = nodes[nodes.length - 1];
    if (prev?.isText && prev.marks.some((mark) => mark.type === schema.marks.link)) {
      nodes.push(schema.text(' '));
    }
    nodes.push(schema.text(href, [schema.marks.link.create({ href })]));
  });

  const message = errors.length
    ? `${errors[0]}${rejected > 1 ? ` (${rejected} assets skipped)` : ''}` : undefined;
  if (!nodes.length) return { error: 'asset-rejected', message };
  return { nodes, message };
}

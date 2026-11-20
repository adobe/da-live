// eslint-disable-next-line import/no-unresolved
import { Plugin, PluginKey } from 'da-y-wrapper';
import getPathDetails from '../../../shared/pathDetails.js';
import { getLivePreviewUrl } from '../../../shared/constants.js';
import { createBranchMediaRenderer, MEDIA_PLACEHOLDER } from '../../../shared/branch-selector/branch-media.js';

const mediaBusImageKey = new PluginKey('mediaBusImage');

// Documents store image src as a path relative to the published page
// (e.g. "./media_123.png"), which only resolves once the page is actually
// served from its preview/live origin. The editor UI runs on a different
// origin, so it can't load that path directly — rewrite it to the doc's
// preview origin for display only; the underlying node attrs (and thus the
// saved document) keep the relative path.
export function getRenderableSrc(src) {
  if (!src || !src.startsWith('./media_')) return null;
  const details = getPathDetails();
  if (!details?.org || !details?.site) return null;
  if (details.site.includes('~')) return MEDIA_PLACEHOLDER;
  return `${getLivePreviewUrl(details.org, details.site)}/${src.slice(2)}`;
}

function updateImageSrcs(view) {
  view.dom.querySelectorAll('img[src^="./media_"]').forEach((img) => {
    const renderableSrc = getRenderableSrc(img.getAttribute('src'));
    if (renderableSrc) img.src = renderableSrc;
  });
}

export default function mediaBusImage() {
  return new Plugin({
    key: mediaBusImageKey,
    view(view) {
      const { hash } = window.location;
      const rawSite = hash.startsWith('#/') ? hash.slice(2).split('/')[1] : '';
      if (rawSite?.includes('~')) {
        let details;
        try { details = getPathDetails(); } catch { /* Invalid branches remain placeholders. */ }
        const context = { org: details?.org, repo: details?.site, path: details?.fullpath };
        const renderer = createBranchMediaRenderer(context);
        renderer.update(view);
        return {
          update(updatedView, prevState) {
            if (updatedView.state.doc !== prevState.doc) renderer.update(updatedView);
          },
          destroy: renderer.destroy,
        };
      }
      updateImageSrcs(view);
      return {
        update(updatedView, prevState) {
          if (updatedView.state.doc !== prevState.doc) updateImageSrcs(updatedView);
        },
      };
    },
  });
}

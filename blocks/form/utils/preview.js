import { getLivePreviewUrl } from '../../shared/constants.js';
import { contentLogin, getAuthToken, livePreviewLogin } from '../../shared/utils.js';

/**
 * Signs in to the hosts that serve uploaded images and returns the origin that
 * relative media bus hrefs resolve against. Media bus images load from the live
 * preview, legacy DA uploads from DA content.
 * @param {object} options The repository coordinates.
 * @param {string} options.owner The DA org.
 * @param {string} options.repo The DA site.
 * @returns {Promise<string>} The live preview origin of the site.
 */
export async function loadPreviewOrigin({ owner, repo }) {
  if (await getAuthToken()) {
    await Promise.all([livePreviewLogin(owner, repo), contentLogin(owner, repo)]);
  }
  return getLivePreviewUrl(owner, repo);
}

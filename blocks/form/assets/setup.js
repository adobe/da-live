import { getNx2 } from '../../../scripts/utils.js';
import { createAssetSources } from './sources.js';

/** The nx2 module that reads the site's AEM Assets repository configuration. */
const REPOSITORY_CONFIG_MODULE = `${getNx2()}/utils/aem-assets/repository-config.js`;

/**
 * Reads the site's AEM Assets repository configuration.
 * @param {object} details The document details, with the `owner` and `repo` of the site.
 * @returns {Promise<object|null>} The configuration, or null when it is unavailable.
 */
async function loadRepositoryConfig({ owner, repo }) {
  try {
    const { getRepositoryConfig } = await import(REPOSITORY_CONFIG_MODULE);
    return await getRepositoryConfig(owner, repo);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('AEM Assets configuration unavailable. Offering Upload only.', error);
    return null;
  }
}

/**
 * Loads what asset fields need from the site's AEM Assets configuration: the sources they
 * select from and the SDK writer config they are saved with. Like Canvas, AEM images are
 * saved as links when the site sets `aem.assets.image.type` to `link`. Without a usable
 * configuration the form offers Upload only.
 * @param {object} options The document to load the setup for.
 * @param {object} options.details The document details.
 * @param {() => boolean} options.isCurrent Answers whether the document is still open.
 * @returns {Promise<{ sources: object[], writerConfig: { externalImagesAsLinks: boolean } }>}
 *   The sources, see `createAssetSources`, and the `config` of `convertJsonToHtml`.
 */
export async function loadAssetSetup({ details, isCurrent }) {
  const repositoryConfig = await loadRepositoryConfig(details);
  return {
    sources: createAssetSources({ details, repositoryConfig, isCurrent }),
    writerConfig: { externalImagesAsLinks: repositoryConfig?.insertAsLink === true },
  };
}

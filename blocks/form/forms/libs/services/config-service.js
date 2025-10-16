/*
 * ConfigService
 * Parses URL parameters and normalizes flags/config for the editor runtime.
 */

/**
 * ConfigService
 *
 * Parses editor URL query/hash parameters and normalizes runtime flags.
 * Also provides helpers to load and read project configuration from
 * the AEM configuration endpoints.
 */
import { STORAGE_VERSIONS } from './storage/index.js';
import { DA_ORIGIN } from '../../utils.js';

export class ConfigService {
  constructor() {
    this._fullConfJsons = {};
    this._sheetCache = {};
  }

  /** Parse URL and return normalized config flags and paths. */
  parseUrl(urlString) {
    try {
      const url = new URL(urlString);
      const params = url.searchParams;
      const hashPath = url.hash?.replace('#/', '/') || '';
      let pagePath = params.get('page') || hashPath || '';
      // Normalize pagePath by stripping leading org/repo if present: /org/repo/... -> /...
      if (pagePath) {
        const parts = pagePath.split('/').filter(Boolean);
        if (parts.length > 2) {
          pagePath = '/' + parts.slice(2).join('/');
        } else if (!pagePath.startsWith('/')) {
          pagePath = '/' + pagePath;
        }
      }
      const storageVersion = params.get('storage');

      const allowLocalSchemas = params.get('allowLocalSchemas') === 'true';
      return {
        pagePath,
        storageVersion,
        allowLocalSchemas,
      };
    } catch {
      return { pagePath: '', storageVersion, allowLocalSchemas: false };
    }
  }

  async _fetchConf(path) {
    if (this._sheetCache[path]) return this._sheetCache[path];
    const resp = await fetch(`${DA_ORIGIN}/config${path}`);
    if (!resp.ok) return null;
    this._fullConfJsons[path] = await resp.json();
    const data = this._extractFirstSheet(this._fullConfJsons[path]);
    if (!data) return null;
    this._sheetCache[path] = data;
    return data;
  }

  _extractFirstSheet(json) {
    if (!json || typeof json !== 'object') return null;
    if (Array.isArray(json.data)) return json.data;
    const firstArray = Object.values(json).find((v) => Array.isArray(v));
    if (firstArray && Array.isArray(firstArray)) return firstArray;
    const firstObjWithData = Object.values(json).find((v) => v && typeof v === 'object' && Array.isArray(v.data));
    return firstObjWithData ? firstObjWithData.data : null;
  }

  async _fetchValue(path, key) {
    if (this._sheetCache[path] && this._sheetCache[path][key]) return this._sheetCache[path][key];
    const data = await this._fetchConf(path);
    if (!data) return null;
    const confKey = data.find((conf) => conf.key === key);
    if (!confKey) return null;
    return confKey.value;
  }

  _constructConfigPaths(owner, repo) {
    return [`/${owner}/${repo}/`, `/${owner}/`];
  }

  /**
   * Returns the value for a configuration key, searching repo first then owner scope.
   * @param {string} owner
   * @param {string} repo
   * @param {string} key
   */
  async getConfKey(owner, repo, key) {
    if (!(repo || owner)) return null;
    for (const path of this._constructConfigPaths(owner, repo)) {
      const value = await this._fetchValue(path, key);
      if (value) return value;
    }
    return null;
  }

  /**
   * Returns the responsive image configuration if present.
   * @param {string} owner
   * @param {string} repo
   * @returns {Promise<Array|false>}
   */
  async getResponsiveImageConfig(owner, repo) {
    if (!(repo || owner)) return null;
    for (const path of this._constructConfigPaths(owner, repo)) {
      if (!this._fullConfJsons[path]) await this._fetchConf(path);
      const fullConfigJson = this._fullConfJsons[path];
      const responsiveImages = fullConfigJson && fullConfigJson['responsive-images'];
      if (responsiveImages && responsiveImages.data) {
        return responsiveImages.data.map((config) => ({
          ...config,
          crops: (config && config.crops ? String(config.crops).split(/\s*,\s*/) : []),
        }));
      }
    }
    return false;
  }

  /**
   * Returns a unified, resolved config object ready for consumers.
   * The function still fetches raw URL and sheet values internally,
   * but only returns the effective values.
   */
  async getProjectConfig(context = {}) {
    const urlString = typeof window !== 'undefined' ? window.location?.href || '' : '';
    const url = this.parseUrl(urlString);

    const owner = context?.org || context?.owner;
    const repo = context?.repo;

    // Sheet values used broadly across the app
    const [
      repositoryId,
      prodOrigin,
      dmDeliveryFlag,
      imageType,
      storageType,
      storagePathPrefix,
      featureToggleEnabledRaw,
      featureToggleDefaultOnRaw,
      legacyEnableToggleOptionalGroupsRaw,
      legacyDefaultToggleOptionalGroupsRaw,
      // Search feature flag
      featureSearchEnabledRaw,
    ] = await Promise.all([
      this.getConfKey(owner, repo, 'aem.repositoryId'),
      this.getConfKey(owner, repo, 'aem.assets.prod.origin'),
      this.getConfKey(owner, repo, 'aem.asset.dm.delivery'),
      this.getConfKey(owner, repo, 'aem.assets.image.type'),
      this.getConfKey(owner, repo, 'storage.type'),
      this.getConfKey(owner, repo, 'storage.type.path.prefix'),
      // New keys
      this.getConfKey(owner, repo, 'ui.feature.toggleOptionalGroups.enabled'),
      this.getConfKey(owner, repo, 'ui.feature.toggleOptionalGroups.defaultOn'),
      // Back-compat keys (older shape)
      this.getConfKey(owner, repo, 'ui.enableToggleOptionalGroups'),
      this.getConfKey(owner, repo, 'ui.defaultToggleOptionalGroups'),
      // Search feature flag key
      this.getConfKey(owner, repo, 'ui.feature.search.enabled'),
    ]);

    const sheet = {
      repositoryId: repositoryId || null,
      prodOrigin: prodOrigin || null,
      dmDeliveryFlag: dmDeliveryFlag || null,
      imageType: imageType || null,
      storageType: storageType || null,
      storagePathPrefix: storagePathPrefix || null,
    };

    // Resolve storage version with precedence and optional prefix matching
    const resolvedStorage = this._resolveStorageVersion({
      sheetStorageType: storageType,
      sheetStoragePathPrefix: storagePathPrefix,
      urlStorageType: url.storageVersion,
      currentPagePath: url.pagePath,
    });

    // Normalize boolean-like values for UI feature flags
    const toBool = (v) => {
      const s = String(v || '').trim().toLowerCase();
      return s === 'true'
    };
    const uiToggleOptionalGroups = toBool(featureToggleEnabledRaw) || toBool(legacyEnableToggleOptionalGroupsRaw);
    const uiDefaultToggleOptionalGroups = toBool(featureToggleDefaultOnRaw) || toBool(legacyDefaultToggleOptionalGroupsRaw);
    const uiSearchEnabled = toBool(featureSearchEnabledRaw);

    const assetDelivery = await this.computeAssetDeliverySettings(context, { repositoryId, prodOrigin, dmDeliveryFlag, imageType });

    const unified = {
      // URL-derived
      pagePath: url.pagePath,
      allowLocalSchemas: url.allowLocalSchemas,
      // effective computed
      storageVersion: resolvedStorage,
      // asset delivery settings grouped under one key
      assetDelivery: {
        repoId: assetDelivery.repoId,
        aemTierType: assetDelivery.aemTierType,
        prodOrigin: assetDelivery.prodOrigin,
        dmDeliveryEnabled: assetDelivery.dmDeliveryEnabled,
        injectLink: assetDelivery.injectLink,
      },
      ui: {
        feature: {
          toggleOptionalGroups: {
            enabled: uiToggleOptionalGroups,
            defaultOn: uiDefaultToggleOptionalGroups,
          },
          search: {
            enabled: uiSearchEnabled,
          },
        }
      }
    };
    console.log('config', unified);
    return unified;
  }

  /**
   * Computes asset delivery settings once based on org/repo and sheet values.
   * You can pass pre-fetched sheet values via overrides to avoid extra calls.
   */
  async computeAssetDeliverySettings(context = {}, overrides = {}) {
    const owner = context?.org || context?.owner;
    const repo = context?.repo;
    const repositoryId = overrides.repositoryId ?? await this.getConfKey(owner, repo, 'aem.repositoryId');
    const baseRepoId = repositoryId || (owner && repo ? `${owner}/${repo}/author` : null);
    const aemTierType = baseRepoId && baseRepoId.includes('delivery') ? 'delivery' : 'author';

    let prodOrigin = overrides.prodOrigin ?? await this.getConfKey(owner, repo, 'aem.assets.prod.origin');
    const dmDeliveryEnabled = (overrides.dmDeliveryFlag ?? await this.getConfKey(owner, repo, 'aem.asset.dm.delivery')) === 'on'
      || (prodOrigin && prodOrigin.startsWith('delivery-'));
    prodOrigin = prodOrigin || (baseRepoId ? `${baseRepoId.replace('author', dmDeliveryEnabled ? 'delivery' : 'publish')}` : null);

    const injectLink = (overrides.imageType ?? await this.getConfKey(owner, repo, 'aem.assets.image.type')) === 'link';

    return { repoId: baseRepoId, aemTierType, prodOrigin, dmDeliveryEnabled, injectLink };
  }

  _resolveStorageVersion({ sheetStorageType, sheetStoragePathPrefix, urlStorageType, currentPagePath }) {
    const sheetStorageLower = (sheetStorageType || '').toLowerCase();
    const urlStorageLower = (urlStorageType || '').toLowerCase();
    const isValidStorageType = (value) => value === STORAGE_VERSIONS.CODE || value === STORAGE_VERSIONS.HTML;

    // Get storage type from URL
    if (isValidStorageType(urlStorageLower)) return urlStorageLower;

    // Get storage type from sheet
    const hasPrefix = typeof sheetStoragePathPrefix === 'string' && sheetStoragePathPrefix.length > 0;
    const pagePathString = typeof currentPagePath === 'string' ? currentPagePath : '';

    // If both sheet type and prefix are set: apply only when path matches
    if (isValidStorageType(sheetStorageLower) && hasPrefix && pagePathString.startsWith(sheetStoragePathPrefix)) {
      return sheetStorageLower;
    }

    // If sheet type set without prefix: sheet takes precedence over URL
    if (isValidStorageType(sheetStorageLower) && !hasPrefix) return sheetStorageLower;

    // Fallback default
    return STORAGE_VERSIONS.HTML;
  }
}

export default ConfigService;



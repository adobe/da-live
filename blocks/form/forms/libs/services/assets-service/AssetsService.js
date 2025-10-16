import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { getAssetPickerHost } from '../../form-ui/renderers/asset-picker-host.js';


// Persist handlers between opens so we can reuse the same selector instance
let pendingFinalize = null;

export class AssetsService {
  constructor(context = {}) {
    this._context = context || {};
  }
  async getAuthStatus() {
    try {
      let token = null;
      if (this._context && this._context.services && this._context.services.auth && this._context.services.auth.getToken) {
        token = await this._context.services.auth.getToken();
      } else {
        const sdk = await DA_SDK;
        token = sdk && sdk.token;
      }
      return { authenticated: !!token };
    } catch (e) {
      return { authenticated: false, error: e };
    }
  }

  /** Open asset picker and resolve with a selected asset URL (image rendition). */
  async openPicker() {
    try {
      // Align with da-assets.js: use token and repoId from config
      const sdk = await DA_SDK;
      let imsToken = null;
      if (this._context && this._context.services && this._context.services.auth && this._context.services.auth.getToken) {
        imsToken = await this._context.services.auth.getToken();
      } else {
        imsToken = sdk && sdk.token;
      }
      if (!imsToken) {
        try { window.dispatchEvent(new CustomEvent('da-asset-auth-required')); } catch { }
        return null;
      }

      const ctx = sdk && sdk.context;
      const org = ctx && ctx.org;
      const repo = ctx && ctx.repo;
      if (!org || !repo) return null;

      // Unified delivery settings via ConfigService
      const configService = this._context?.services?.config;
      let repoId = `${org}/${repo}/author`;
      let aemTierType = 'author';
      let prodOrigin = `${org}/${repo}/publish`;
      let dmDeliveryEnabled = false;
      let injectLink = false;
      if (configService && typeof configService.computeAssetDeliverySettings === 'function') {
        const resolved = await configService.computeAssetDeliverySettings({ org, repo });
        repoId = resolved?.repoId || repoId;
        aemTierType = resolved?.aemTierType || aemTierType;
        prodOrigin = resolved?.prodOrigin || prodOrigin;
        dmDeliveryEnabled = !!resolved?.dmDeliveryEnabled;
        injectLink = !!resolved?.injectLink;
      }

      const baseDmUrlFor = (asset) => `https://${prodOrigin}${prodOrigin.includes('/') ? '' : '/adobe/assets/'}${asset['repo:id']}`;
      const assetUrlFor = (asset, name = asset.name) => {
        if (!dmDeliveryEnabled) return `https://${prodOrigin}${asset.path}`;
        return `${baseDmUrlFor(asset)}/as/${name}`;
      };

      const host = getAssetPickerHost();
      const selectorConfig = { imsToken, repositoryId: repoId, aemTierType };
      const meta = { org, repo, repoId, aemTierType, dmDeliveryEnabled, prodOrigin, injectLink };
      const helpers = {
        getBaseDmUrl: baseDmUrlFor,
        getAssetUrl: assetUrlFor,
        getResponsiveImageConfig: (o, r) => configService?.getResponsiveImageConfig(o, r),
        buildResultObject,
      };

      return await new Promise((resolve) => {
        pendingFinalize = (value) => resolve(value);
        host.show({
          selectorConfig,
          meta,
          helpers,
          callbacks: {
            onResult: (payload) => {
              try { window.dispatchEvent(new CustomEvent('da-asset-selected', { detail: payload })); } catch { }
              if (typeof pendingFinalize === 'function') pendingFinalize(payload);
              pendingFinalize = null;
            },
            onCancel: () => {
              try { window.dispatchEvent(new CustomEvent('da-asset-cancelled')); } catch { }
              if (typeof pendingFinalize === 'function') pendingFinalize(null);
              pendingFinalize = null;
            },
          },
        });
      });
    } catch (error) {
      try { console.error('[AssetsService] openPicker error:', error); } catch { }
      return null;
    }
  }
}

function buildResultObject({ asset, src }, meta) {
  const org = meta && meta.org;
  const repo = meta && meta.repo;
  const repoId = meta && meta.repoId;
  const aemTierType = meta && meta.aemTierType;
  const dmDeliveryEnabled = meta && meta.dmDeliveryEnabled;
  const prodOrigin = meta && meta.prodOrigin;
  const injectLink = meta && meta.injectLink;
  const alt = (meta && meta.alt) || null;
  return {
    src: src || null,
    org,
    repo,
    repoId,
    aemTierType,
    dmDeliveryEnabled,
    prodOrigin,
    injectLink,
    alt,
    asset: {
      id: asset && asset['repo:id'],
      name: asset && asset.name,
      path: asset && asset.path,
      mimetype: (asset && (asset.mimetype || asset['dc:format'])) || null,
      // eslint-disable-next-line no-underscore-dangle
      status: asset && asset._embedded && asset._embedded['http://ns.adobe.com/adobecloud/rel/metadata/asset'] && asset._embedded['http://ns.adobe.com/adobecloud/rel/metadata/asset']['dam:assetStatus'],
      // eslint-disable-next-line no-underscore-dangle
      activationTarget: asset && asset._embedded && asset._embedded['http://ns.adobe.com/adobecloud/rel/metadata/asset'] && asset._embedded['http://ns.adobe.com/adobecloud/rel/metadata/asset']['dam:activationTarget'],
      // eslint-disable-next-line no-underscore-dangle
      links: asset && asset._links,
    },
  };
}

export default AssetsService;



# DA Assets — AEM Asset Selector

Integrates the [AEM Asset Selector](https://experience.adobe.com/solutions/CQ-assets-selectors) into the DA editor, allowing authors to browse and insert assets from an AEM as a Cloud Service instance directly into a document.

## File structure

```
da-assets/
  da-assets.js        Orchestrator — IMS auth, dialog lifecycle, selector mount
  da-assets.css       Dialog and crop selector styles
  helpers/
    config.js         DA site config fetch/cache and repository mode resolution
    constants.js      Shared constants (DEFAULT_ASSET_BASE_PATH)
    urls.js           Asset URL builders (one per repository mode) and rendition resolution
    insert.js         ProseMirror insertion helpers
    smart-crop.js     Smart Crop selection dialog UI
```

---

## Repository modes

The behaviour of the asset selector is determined entirely by the `aem.repositoryId` config key and a set of optional flags. There are three distinct modes:

### 1. Author + Publish

`aem.repositoryId` starts with `author-`.

- Asset browser shows the full **folder hierarchy** from AEM DAM.
- Inserted URLs point to the **publish** instance: `https://publish-p…/content/dam/…`

### 2. Author + Dynamic Media Delivery

`aem.repositoryId` starts with `author-` **and** any of the following are true:
- `aem.asset.dm.delivery = on`
- `aem.asset.smartcrop.select = on`
- `aem.assets.prod.origin` starts with `delivery-`

- Asset browser shows the full **folder hierarchy** from AEM DAM.
- Inserted URLs are **DM delivery URLs**: `https://delivery-p…/<basePath>/<id>/as/<name>.avif`
- Assets must be **approved** (`dam:assetStatus = approved`) and **activated for delivery** (`dam:activationTarget = delivery`) before they can be inserted. Unapproved assets show an error panel.
- When `aem.asset.smartcrop.select = on`, a Smart Crop selection dialog is shown for images.

### 3. Delivery (DM Open API)

`aem.repositoryId` starts with `delivery-`. Requires **DM Open API** to be enabled on the AEM environment.

- Asset browser shows a **flat listing** (no folder structure) of all approved assets.
- Inserted URLs follow the [AEM Delivery API spec](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/manage/asset-selector/asset-selector-integration/integrate-asset-selector-dynamic-media-open-api): `https://<host>/<basePath>/<asset-id>/as/<seo-name>.avif`
- No approval check is needed — the delivery tier only exposes approved assets.

---

## Configuration

All keys are set in the DA site config at `https://da.live/config#/<org>/` or `https://da.live/config#/<org>/<repo>/`. Repo-level values take precedence over org-level.

| Key | Required | Values | Description |
|---|---|---|---|
| `aem.repositoryId` | Yes | `author-pXXXX-eYYYY.adobeaemcloud.com` or `delivery-pXXXX-eYYYY.adobeaemcloud.com` | Determines the repository mode. The prefix (`author-` / `delivery-`) controls which mode is active. |
| `aem.assets.prod.origin` | No | e.g. `https://mysite.com` | Overrides the auto-derived asset URL origin for the final inserted URL. If the value starts with `delivery-`, DM delivery mode is also activated. |
| `aem.assets.prod.basepath` | No | e.g. `/adobe/assets` | Overrides the default base path (`/adobe/assets`) used in DM and delivery URLs. |
| `aem.assets.image.type` | No | `link` | Insert images as `<a>` links instead of `<img>` tags. Useful for Dynamic Media URLs that need to bypass Media Bus. |
| `aem.asset.dm.delivery` | No | `on` | Use author for browsing but construct DM delivery URLs when inserting. Activates Author+DM mode. |
| `aem.asset.smartcrop.select` | No | `on` | Show the Smart Crop selection dialog when an image is selected. Implies DM delivery. |
| `aem.asset.mime.renditions` | No | e.g. `image/vnd.adobe.photoshop:avif, image/*:original, video/*:original` | Comma-separated `mimetype:renditiontype` pairs that override the default rendition type for specific mime types. Supports exact types and prefix wildcards (`image/*`, `video/*`). See [Rendition resolution](#rendition-resolution). |

---

## URL construction

Inserted URLs are built differently depending on the active mode and asset type. The base path defaults to `/adobe/assets` and can be overridden with `aem.assets.prod.basepath`.

### Rendition resolution

For DM and delivery modes, the rendition type is resolved by `resolveRenditionType()` with the following precedence:

1. **Exact match** in `aem.asset.mime.renditions` (e.g. `image/vnd.adobe.photoshop` → `avif`).
2. **Prefix wildcard** in `aem.asset.mime.renditions` (e.g. `image/*` → `original`).
3. **Built-in prefix defaults**: `image/*` → `avif`, `video/*` → `play`.
4. **Fallback**: any unrecognised mime type → `original`.

The resolved rendition type determines the URL suffix:

| Rendition type | URL suffix |
|---|---|
| `avif` | `/as/<seo-name>.avif` |
| `play` | `/play` |
| `original` | `/original/as/<filename>` |

### Author + Publish

| Asset type | URL pattern |
|---|---|
| Image / document / other | `https://<publishOrigin><asset.path>` |
| Video | `/play` rendition link from `_links` if available, else `https://<publishOrigin><asset.path>` |

### Author + DM Delivery

| Asset type | URL pattern (default rendition) |
|---|---|
| Image | `https://<dmOrigin>/<basePath>/<repo:id>/as/<seo-name>.avif` |
| Video | `https://<dmOrigin>/<basePath>/<repo:id>/play` |
| Other (PDF, CSV…) | `https://<dmOrigin>/<basePath>/<repo:id>/original/as/<filename>` |

### Delivery (DM Open API)

Asset response fields used: `repo:assetId`, `repo:repositoryId`, `repo:name`.

| Asset type | URL pattern (default rendition) |
|---|---|
| Image | `https://<host>/<basePath>/<repo:assetId>/as/<seoName>.avif` |
| Video | `https://<host>/<basePath>/<repo:assetId>/play` |
| Other (PDF, CSV…) | `https://<host>/<basePath>/<repo:assetId>/original/as/<repo:name>` |

`seoName` is the filename without its extension, per the AEM Open API specification. `<host>` is `repo:repositoryId` unless overridden by `aem.assets.prod.origin`.

---

## Responsive image config

When `aem.asset.smartcrop.select = on`, the Smart Crop dialog can optionally show pre-configured multi-crop insert options. These are defined in a `responsive-images` sheet in the DA site config:

| Column | Description |
|---|---|
| `name` | Label shown in the UI (e.g. `Full Width`) |
| `position` | Where this config applies: `everywhere`, `outside-blocks`, or a block name (e.g. `hero`) |
| `crops` | Comma-separated list of Smart Crop names that must all exist on the asset (e.g. `desktop, mobile, tablet`) |

---

## Module responsibilities

### `helpers/constants.js`

Exports `DEFAULT_ASSET_BASE_PATH` (`/adobe/assets`), the default base path segment used in DM and delivery URLs.

### `helpers/config.js`

- `parseMimeRenditions(configValue, defaults)` — parses the `aem.asset.mime.renditions` config string into a `Record<string, string>` map of mime-type to rendition-type. Supports exact types and prefix wildcards.
- `getConfKey(owner, repo, key)` — fetches a single key from the cascading DA site config (repo-level first, then org-level). Results are cached for the page session.
- `getRepositoryConfig(owner, repo)` — resolves all config keys into a single `repoConfig` object used throughout the selector.
- `getResponsiveImageConfig(owner, repo)` — returns the parsed `responsive-images` sheet for Smart Crop structure selection.

`repoConfig` shape:

```js
{
  repositoryId,           // e.g. 'author-p1-e1.adobeaemcloud.com'
  tierType,               // 'author' | 'delivery'
  assetOrigin,            // final URL host for inserted assets
  assetBasePath,          // base path segment (default '/adobe/assets')
  isDmEnabled,            // true when DM delivery URLs should be used
  isSmartCrop,            // true when Smart Crop selection is active
  insertAsLink,           // true when images should be inserted as <a> links
  mimeRenditionOverrides, // Record<string, string> from aem.asset.mime.renditions
}
```

### `helpers/urls.js`

URL builder functions keyed to the mode:

- `buildAuthorUrl(asset, publishOrigin)` — author+publish mode.
- `buildDmUrl(asset, host, basePath, renditionOptions)` — author+DM mode. Uses `repo:id` from the asset.
- `buildDeliveryUrl(asset, overrideHost, basePath, renditionOptions)` — delivery tier. Uses `repo:assetId` and `repo:repositoryId` from the asset; `overrideHost` takes precedence over `repo:repositoryId`.
- `buildSmartCropUrl(asset, dmOrigin, cropName, basePath)` — builds a smart crop URL with `?smartcrop=<cropName>`.
- `buildSmartCropsListUrl(asset, dmOrigin, basePath)` — builds the URL to fetch available smart crops for an asset.

Plus:

- `resolveRenditionType(mimetype, { mimeRenditionOverrides })` — determines the rendition type (`avif` / `play` / `original`) using override map and built-in defaults.
- `getAssetAlt(asset)` — reads alt text from `_embedded` metadata (`dc:description` or `dc:title`).
- `getDmApprovalStatus(asset)` — reads `dam:assetStatus` and `dam:activationTarget` from `_embedded` metadata.

### `helpers/insert.js`

ProseMirror helpers that operate on `window.view`:

- `insertImage(view, src, alt)` — inserts an image node at the current selection.
- `insertLink(view, src)` — inserts the URL as a plain `<a>` link wrapped in a paragraph.
- `insertFragment(view, nodes)` — inserts multiple nodes (used for multi-crop insertion).
- `createImageNode(view, src, alt)` — creates an image node without dispatching.
- `findBlockContext(view)` — walks up the ProseMirror node tree to find the nearest enclosing table.
- `getBlockName(view)` — resolves the enclosing table block name for responsive image config matching.

### `helpers/smart-crop.js`

`showSmartCropDialog(opts)` — renders the Smart Crop selection UI into a container element.

Options: `container`, `asset`, `assetUrl`, `dmOrigin`, `dmBasePath`, `blockName`, `responsiveImageConfigPromise`, `onInsert`, `onBack`, `onCancel`.

Returns `false` if the asset has no smart crops (caller should insert the original directly).

### `da-assets.js`

Entry point. Key exports:

- `openAssets()` — main entry point that:
  1. Checks IMS authentication.
  2. Calls `getRepositoryConfig` to resolve the active mode.
  3. Creates the `<dialog>` with two panels (asset selector and secondary for crops/errors) and mounts the AEM Asset Selector via `window.PureJSSelectors.renderAssetSelector`.
  4. Handles selection by routing to the correct URL builder, approval check, or Smart Crop dialog based on the mode.
- `formatExternalBrief(doc)` — extracts the document title and plain-text content from the ProseMirror doc to build an AI advisor brief for the asset selector.
- `buildFeatureSet(isDmEnabled)` — returns the feature set array for the selector. Base features: `upload`, `collections`, `detail-panel`, `advisor`. Adds `dynamic-media` when DM is enabled.
- `resolveAssetUrl(asset, repoConfig)` — routes to the correct URL builder based on mode and config.
- `createDialogPanels()` — creates the two dialog inner panels (asset panel and secondary panel).
- `buildHandleSelection(dialog, assetPanel, secondaryPanel, repoConfig, responsiveImageConfigPromise)` — returns the selection handler callback wired to the dialog lifecycle.

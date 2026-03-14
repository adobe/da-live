# DA Assets — AEM Asset Selector

Integrates the [AEM Asset Selector](https://experience.adobe.com/solutions/CQ-assets-selectors) into the DA editor, allowing authors to browse and insert assets from an AEM as a Cloud Service instance directly into a document.

## File structure

```
da-assets/
  da-assets.js        Orchestrator — IMS auth, dialog lifecycle, selector mount
  da-assets.css       Dialog and crop selector styles
  helpers/
    config.js         DA site config fetch/cache and repository mode resolution
    urls.js           Asset URL builders (one per repository mode)
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

`aem.repositoryId` starts with `author-` **and** `aem.asset.dm.delivery = on` (or `aem.asset.smartcrop.select = on`).

- Asset browser shows the full **folder hierarchy** from AEM DAM.
- Inserted URLs are **DM delivery URLs**: `https://delivery-p…/adobe/assets/<id>/as/<name>`
- Assets must be **approved** (`dam:assetStatus = approved`) and **activated for delivery** (`dam:activationTarget = delivery`) before they can be inserted. Unapproved assets show an error panel.
- When `aem.asset.smartcrop.select = on`, a Smart Crop selection dialog is shown for images.

### 3. Delivery (DM Open API)

`aem.repositoryId` starts with `delivery-`. Requires **DM Open API** to be enabled on the AEM environment.

- Asset browser shows a **flat listing** (no folder structure) of all approved assets.
- Inserted URLs follow the [AEM Delivery API spec](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/manage/asset-selector/asset-selector-integration/integrate-asset-selector-dynamic-media-open-api): `https://<delivery-host>/adobe/assets/<asset-id>/as/<seo-name>.<ext>`
- No approval check is needed — the delivery tier only exposes approved assets.

---

## Configuration

All keys are set in the DA site config at `https://da.live/config#/<org>/` or `https://da.live/config#/<org>/<repo>/`. Repo-level values take precedence over org-level.

| Key | Required | Values | Description |
|---|---|---|---|
| `aem.repositoryId` | Yes | `author-pXXXX-eYYYY.adobeaemcloud.com` or `delivery-pXXXX-eYYYY.adobeaemcloud.com` | Determines the repository mode. The prefix (`author-` / `delivery-`) controls which mode is active. |
| `aem.assets.prod.origin` | No | e.g. `https://mysite.com` | Overrides the auto-derived asset URL origin for the final inserted URL. |
| `aem.assets.image.type` | No | `link` | Insert images as `<a>` links instead of `<img>` tags. Useful for Dynamic Media URLs that need to bypass Media Bus. |
| `aem.asset.dm.delivery` | No | `on` | Use author for browsing but construct DM delivery URLs when inserting. Activates Author+DM mode. |
| `aem.asset.smartcrop.select` | No | `on` | Show the Smart Crop selection dialog when an image is selected. Implies DM delivery. |
| `aem.assets.renditions.select` | No | `on` | (Reserved) Allow authors to choose from available renditions. |

---

## URL construction

Inserted URLs are built differently depending on the active mode and asset type.

### Author + Publish

| Asset type | URL pattern |
|---|---|
| Image / document / other | `https://<publishOrigin><asset.path>` |
| Video | `/play` rendition link from `_links` if available, else `asset.path` |

### Author + DM Delivery

| Asset type | URL pattern |
|---|---|
| Image | `https://<dmOrigin>/adobe/assets/<repo:id>/as/<name>` |
| Video | `https://<dmOrigin>/adobe/assets/<repo:id>/play` |
| Other (PDF, CSV…) | `https://<dmOrigin>/adobe/assets/<repo:id>/original/as/<name>` |

### Delivery (DM Open API)

Asset response fields used: `repo:assetId`, `repo:repositoryId`, `repo:name`.

| Asset type | URL pattern |
|---|---|
| Image | `https://<repo:repositoryId>/adobe/assets/<repo:assetId>/as/<seoName>.<ext>` |
| Video | `https://<repo:repositoryId>/adobe/assets/<repo:assetId>/play` |
| Other (PDF, CSV…) | `https://<repo:repositoryId>/adobe/assets/<repo:assetId>/original/as/<seoName>.<ext>` |

`seoName` is the filename without its extension, per the AEM Open API specification.

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

### `helpers/config.js`

- `getConfKey(owner, repo, key)` — fetches a single key from the cascading DA site config (repo-level first, then org-level). Results are cached for the page session.
- `getRepositoryConfig(owner, repo)` — resolves all config keys into a single `repoConfig` object used throughout the selector.
- `getResponsiveImageConfig(owner, repo)` — returns the parsed `responsive-images` sheet for Smart Crop structure selection.

`repoConfig` shape:

```js
{
  repositoryId,  // e.g. 'author-p1-e1.adobeaemcloud.com'
  tierType,      // 'author' | 'delivery'
  assetOrigin,   // final URL host for inserted assets
  isDmEnabled,   // true when DM delivery URLs should be used
  isSmartCrop,   // true when Smart Crop selection is active
  insertAsLink,  // true when images should be inserted as <a> links
}
```

### `helpers/urls.js`

Three URL builder functions keyed to the mode:

- `buildAuthorUrl(asset, publishOrigin)` — author+publish
- `buildDmUrl(asset, dmOrigin)` — author+DM
- `buildDeliveryUrl(asset)` — delivery tier (reads host from `asset['repo:repositoryId']`)

Plus metadata helpers `getAssetAlt(asset)` and `getDmApprovalStatus(asset)` that read from `_embedded` metadata in author-tier responses.

### `helpers/insert.js`

ProseMirror helpers that operate on `window.view`:

- `insertImage(view, src, alt)` — inserts an image node at the current selection.
- `insertLink(view, src)` — inserts the URL as a plain `<a>` link.
- `insertFragment(view, nodes)` — inserts multiple nodes (used for multi-crop insertion).
- `createImageNode(view, src, alt)` — creates an image node without dispatching.
- `findBlockContext(view)` / `getBlockName(view)` — resolves the enclosing table block name for responsive image config matching.

### `helpers/smart-crop.js`

`showSmartCropDialog(opts)` — renders the Smart Crop selection UI into a container element. Takes callbacks (`onInsert`, `onBack`, `onCancel`) and returns `false` if the asset has no smart crops (caller should insert the original directly).

### `da-assets.js`

Entry point. Exports `openAssets()`, which:

1. Checks IMS authentication.
2. Calls `getRepositoryConfig` to resolve the active mode.
3. Creates the `<dialog>` and mounts the AEM Asset Selector via `window.PureJSSelectors.renderAssetSelector`.
4. Handles selection by routing to the correct URL builder, approval check, or Smart Crop dialog based on the mode.

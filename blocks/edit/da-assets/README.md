# DA Assets — AEM Asset Selector

Integrates the [AEM Asset Selector](https://experience.adobe.com/solutions/CQ-assets-selectors) into the DA editor, allowing authors to browse and insert assets from an AEM as a Cloud Service instance directly into a document.

The non-UI logic lives in Nexter at `nx2/utils/aem-assets/`. The classic editor and Canvas import it through `getNx2()`. This folder keeps the dialog, Smart Crop, and ProseMirror insertion.

## File structure

```
da-assets/
  da-assets.js        Orchestrator — IMS auth, dialog lifecycle, selector mount
  da-assets.css       Dialog and crop selector styles
  helpers/
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
- Content Advisor filters the author-tier listing to **Approved** assets by default. The filter is locked. Exact `aem.asset.dm.approvedonly = off` opts out and leaves Content Advisor unfiltered.
- When `aem.asset.smartcrop.select = on`, a Smart Crop selection dialog is shown for images.

### 3. Delivery (DM Open API)

`aem.repositoryId` starts with `delivery-`. Requires **DM Open API** to be enabled on the AEM environment.

- Asset browser shows a **flat listing** (no folder structure) of all approved assets.
- Inserted URLs follow the [AEM Delivery API spec](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/manage/asset-selector/asset-selector-integration/integrate-asset-selector-dynamic-media-open-api): `https://<host>/<basePath>/<asset-id>/as/<seo-name>.avif`
- No approval check is needed — the delivery tier only exposes approved assets.

The approved-only picker behavior is shared by the document editor and Canvas/Experience Workspace.

---

## Configuration

All keys are set in the DA site config at `https://da.live/config#/<org>/` or `https://da.live/config#/<org>/<repo>/`. Repo-level values take precedence over org-level.

| Key | Required | Values | Description |
|---|---|---|---|
| `aem.repositoryId` | Yes | `author-pXXXX-eYYYY.adobeaemcloud.com` or `delivery-pXXXX-eYYYY.adobeaemcloud.com` | Determines the repository mode. The prefix (`author-` / `delivery-`) controls which mode is active. |
| `aem.assets.prod.origin` | No | e.g. `https://mysite.com` | Overrides the auto-derived asset URL origin for the final inserted URL. If the value starts with `delivery-`, DM delivery mode is also activated. |
| `aem.assets.prod.basepath` | No | e.g. `/adobe/assets` | Overrides the default base path (`/adobe/assets`) used in DM and delivery URLs. |
| `aem.assets.image.type` | No | `link` | Insert images as `<a>` links instead of `<img>` tags. Useful for Dynamic Media URLs that need to bypass Media Bus. |
| `aem.assets.editableExternalImages` (**`flags` sheet**) | No | `true` | Only applies with `aem.assets.image.type=link`. Images are edited as real `<img>` nodes but still persisted as `<a data-edit-as="image">` links. |
| `aem.asset.dm.delivery` | No | `on` | Use author for browsing but construct DM delivery URLs when inserting. Activates Author+DM mode. |
| `aem.asset.dm.approvedonly` | No | absent, `on`, or `off` | For author-backed Dynamic Media modes, the default is to show only Approved assets through a locked Content Advisor filter. Absent or `on` enables it; exact `off` opts out and leaves Content Advisor unfiltered. Has no effect for Author + Publish or delivery-tier browsing. |
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

### Nexter `nx2/utils/aem-assets/`

| Module | Provides |
|---|---|
| `repository-config.js` | `getRepositoryConfig`, `getResponsiveImageConfig`, `parseMimeRenditions` |
| `selection.js` | `resolveAssetSelection`, `resolveAssetUrl`, error messages |
| `selector-props.js` | `buildAssetSelectorProps`, `buildFeatureSet`, `rememberAssetFolder` |
| `selector.js` | `ASSET_SELECTOR_URL`, `loadAssetSelector` |
| `urls.js` | URL builders, `resolveRenditionType`, `getAssetAlt`, approval and publish status |
| `image-modifiers.js` | `applySiteImageModifiers`, `parseSiteImageModifiers` |
| `config.js` | Dynamic Media and approved-only rules |
| `filter-schema.js` | Approved-only filter props |
| `constants.js` | Default asset base path |

`resolveAssetSelection({ asset, repoConfig })` returns `{ href, isImage, alt }` or `{ error }`. The error is `MISSING_FORMAT_ERROR_MSG`, `DM_ERROR_MSG` (not approved for delivery), or `PUBLISH_ERROR_MSG` (not published).

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
  4. Handles selection with `buildHandleSelection`.
- `formatExternalBrief(doc)` — extracts the document title and plain-text content from the ProseMirror doc to build an AI advisor brief for the asset selector.
- `createDialogPanels()` — creates the two dialog inner panels (asset panel and secondary panel).
- `buildHandleSelection({ assetPanel, secondaryPanel, repoConfig, responsiveImageConfigPromise, getView, close })` returns the selection handler. It resolves the asset with `resolveAssetSelection`. A missing format is ignored. Other errors show the error panel. With Smart Crop enabled, images open the crop step. Otherwise the asset is inserted as an image or link.

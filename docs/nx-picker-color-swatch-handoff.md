# nx-picker color swatch enhancement handoff

## Context

In `blocks/canvas/ew-page-metadata/ew-page-metadata.js`, page metadata single-select fields are rendered with `nx-picker`.

For metadata values that represent colors (detected from the library `options` sheet via `colorValue` in `blocks/canvas/editor-utils/metadata-fields.js`), we wanted to show a visual swatch in the picker.

## What was tried

### 1. Generic `icon` item property

We passed picker items like:

```js
{ value, label, icon: dataUrlOrSvgPath }
```

Result:
- item data was present on the picker
- no icon node was rendered for normal picker items
- conclusion: `nx-picker` appears to ignore generic `icon` for standard options

### 2. Dynamic SVG data URL as `trailingIcon`

We then matched the working picker pattern used elsewhere:

```js
{ value, label, action: true, trailingIcon: ... }
```

This did render the picker's trailing icon slot, but dynamic SVG data URLs did not work reliably.

Two variants were tested:

- bare inline SVG data URL
- sprite-style SVG data URL with `<symbol id="icon">...`

Root cause:
- `nx-picker` renders trailing icons as `<svg><use href="${trailingIcon}#icon"></use></svg>`
- static external icon files work with that pattern
- dynamic `data:image/svg+xml,...` URLs did not render correctly in this path in the browser

### 3. Current fallback

We switched to a fixed trailing icon for color options:

```js
{ value, label, action: true, trailingIcon: '/img/icons/s2-icon-colorfill-20-n.svg' }
```

This works as a stable fallback, but it does **not** show the actual per-option color.

Note: `action: true` is not needed and should be dropped. In `nx-picker`, `action` items skip `_select()` (meant for "opens in dialog/tab" entries like the tool panel's). `trailingIcon` renders without it.

## Existing precedent: block options slash menu (`nx-menu`)

Color swatches already work in the canvas slash menu. In a block cell, typing `/` offers that block's key/value options from the same library `options` sheet, and color values render as swatches. That menu is `nx-menu`, which already supports a `swatch` item property.

Data flow in da-live:

1. `blocks/canvas/ew-editor-doc/slash-menu/slash-menu.js`
   - `setup()` creates one `nx-menu` (`document.createElement('nx-menu')`) for the slash menu.
   - In cell mode, `syncSlashUi()` calls `ensureBlockOptions(orgSite)` and sets `items = blockOptionItems(view.state, slash.query)`.
   - On `select`, `isBlockOption(id)` → `applyBlockOption(view, id)` writes the value into the cell.
2. `blocks/canvas/ew-editor-doc/slash-menu/block-options.js`
   - `blockOptionItems()` builds menu items; for value options:
     ```js
     items.push({ id, label: v.title, ...(isColorCode(v.value) ? { swatch: v.value } : {}) });
     ```
   - Covered by `test/unit/blocks/canvas/ew-editor-doc/block-options.test.js` ("flags hex-color values with a swatch").
3. `blocks/canvas/editor-utils/color-code.js` `isColorCode()` (hex, rgb/rgba, gradients). Shared with the metadata panel (`metadata-fields.js` sets `colorValue` with it).

Rendering in da-nx (`nx2/blocks/shared/menu/`):

- `menu.js`:
  ```js
  ${item.swatch ? html`<span class="menu-item-swatch" style="background:${item.swatch}"></span>` : nothing}
  ```
- `menu.css`:
  ```css
  .menu-item-swatch {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    border: 1px solid var(--s2-gray-300);
    border-radius: var(--s2-corner-radius-75);
  }
  ```
- Tests: `nx2/test/unit/nx/blocks/shared/menu/menu.test.js` ("renders a color swatch when item.swatch is set").

By contrast, `nx2/blocks/shared/picker/picker.js` (`_renderItem`) only renders `item.trailingIcon` via `<use href="${item.trailingIcon}#icon">` and has no swatch support.

## Current local state

The metadata panel currently uses a fixed icon for color entries in:

- `blocks/canvas/ew-page-metadata/ew-page-metadata.js`

Relevant test coverage:

- `test/unit/blocks/canvas/ew-page-metadata/ew-page-metadata.test.js`

## Suggested nx-picker enhancement

The real fix should happen in the shared `nx-picker` implementation used by NX.

### Goal

Allow `nx-picker` items to show true per-item color swatches.

### Recommended API options

Any of these would solve the problem:

#### Option A: dedicated swatch/color support

Support item data like:

```js
{ value, label, swatch: '#676767' }
```

or

```js
{ value, label, color: '#676767' }
```

Then `nx-picker` itself renders a small rectangle/circle chip inline.

This is the cleanest option.

#### Option B: true generic item icons

Support item data like:

```js
{ value, label, icon: '/path/to/icon.svg' }
```

for normal picker items, not only special trailing-icon cases.

If this path is chosen, it should support either:
- `<img src="...">`
- or a documented SVG sprite contract

A plain `<img>` path is likely more flexible than `<use href="...#icon">`.

#### Option C: allow full `trailingIconHref`

If `nx-picker` wants to keep `<use>` internally, allow a fully-qualified href instead of auto-appending `#icon`.

Example:

```js
{ value, label, trailingIconHref: '#my-local-swatch-symbol' }
```

or

```js
{ value, label, trailingIconHref: '/img/icons/s2-icon-colorfill-20-n.svg#icon' }
```

This would make inline sprite injection possible.

## Recommendation

Go with **Option A, using the same `swatch` property and styling as `nx-menu`**, so both components share one item API:

1. In `nx2/blocks/shared/picker/picker.js` `_renderItem`, render `item.swatch` before the label, like `menu.js` does.
2. Optionally show the selected item's swatch in the picker trigger too.
3. Copy `.menu-item-swatch` styling into the picker CSS (16px, `--s2-gray-300` border, `--s2-corner-radius-75`).
4. Add picker tests mirroring the menu's swatch tests.
5. Keep `trailingIcon` / `action` unchanged for action/open-in items.

That gives the metadata panel exactly what it needs without overloading the action-icon mechanism, and matches what authors already see in the block options slash menu.

## Consumer example after enhancement

If `swatch` support exists, the metadata panel could emit:

```js
{
  value: v.value,
  label: v.title,
  swatch: v.colorValue,
}
```

for color values (dropping `action` / `trailingIcon` and `COLOR_FILL_ICON_SRC`), while non-color values remain:

```js
{
  value: v.value,
  label: v.title,
}
```

## Related: multiselect swatch shape

The metadata panel's `ew-metadata-multiselect` renders its own swatch (`.swatch` in `ew-metadata-multiselect.css`: 12px circle). PR #1359 review comment `4145303628` (usman-khalid) asks for a rounded square like the block options menu, so light colors don't look like radio buttons. Matching `.menu-item-swatch` above keeps the multiselect, `nx-menu` and the future `nx-picker` swatch consistent.

## Why this matters

The page metadata panel is already library-configurable and can define color-like metadata options. Showing the actual swatch in the picker would make selection much clearer and remove the need for any special-case custom field component.

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
{ value, label, action: true, trailingIcon: '/img/icons/s2-icon-color-fill-20-n.svg' }
```

This works as a stable fallback, but it does **not** show the actual per-option color.

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
{ value, label, trailingIconHref: '/img/icons/s2-icon-color-fill-20-n.svg#icon' }
```

This would make inline sprite injection possible.

## Recommendation

Preferred enhancement:

1. add first-class `swatch` support to `nx-picker`
2. render a small rounded rectangle chip next to the label
3. keep existing `trailingIcon` behavior unchanged for action/open-in items

That gives the metadata panel exactly what it needs without overloading the action-icon mechanism.

## Consumer example after enhancement

If `swatch` support exists, the metadata panel could emit:

```js
{
  value: v.value,
  label: v.title,
  swatch: v.colorValue,
}
```

for color values, while non-color values remain:

```js
{
  value: v.value,
  label: v.title,
}
```

## Why this matters

The page metadata panel is already library-configurable and can define color-like metadata options. Showing the actual swatch in the picker would make selection much clearer and remove the need for any special-case custom field component.

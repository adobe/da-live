# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DA Live is Adobe's web-based content authoring platform for Edge Delivery Services. It provides collaborative document editing at https://da.live.

## Development Commands

```bash
# Install dependencies (also builds bundled deps automatically via postinstall)
npm install

# Run local dev server (requires @adobe/aem-cli installed globally)
npm install -g @adobe/aem-cli
aem up

# Linting
npm run lint          # Run both JS and CSS linting
npm run lint:js       # ESLint only
npm run lint:css      # Stylelint only

# Testing
npm test                                    # Run all unit tests with coverage
npm test -- --watch                         # Watch mode
wtr "./test/unit/path/to/file.test.js"      # Run a single test file

# E2E tests (Playwright)
npm run test:e2e

# Build bundled dependencies
npm run build:da-lit        # Build Lit bundle
npm run build:da-y-wrapper  # Build Yjs/ProseMirror wrapper
```

## Local Development Setup

DA requires Adobe IMS authentication. For localhost development:

1. Use a **Stage** Adobe Identity
2. Point to stage services: `localhost:3000/?da-admin=stage&da-collab=stage`
3. To reset environment: `localhost:3000/?da-admin=reset&da-collab=reset`

Environment settings persist in localStorage until reset.

## Architecture

### Routing

The app uses hash-based routing: `/#/org/repo/path`

The URL pathname determines the editor view:
- `/edit` - Document editor (ProseMirror)
- `/sheet` - Spreadsheet editor (jspreadsheet)
- `/config` - Configuration editor
- `/` (root) - File browser

Path details are parsed by `blocks/shared/pathDetails.js` which extracts `owner`, `repo`, `name`, `sourceUrl`, `previewUrl`, etc.

### Blocks (Feature Modules)

Each major feature is a "block" in `blocks/`:
- `edit/` - ProseMirror-based document editor with collaborative editing via Yjs
- `browse/` - File/site browser with Lit web components
- `sheet/` - Spreadsheet editor
- `start/` - Onboarding/project creation
- `shared/` - Common utilities, constants, API helpers

### Key Shared Utilities

- `blocks/shared/constants.js` - Environment URLs (DA_ORIGIN, COLLAB_ORIGIN)
- `blocks/shared/utils.js` - `daFetch()` for authenticated requests, `saveToDa()` for saves
- `blocks/shared/pathDetails.js` - URL parsing and path detail extraction
- `scripts/utils.js` - `sanitizeName()`, `sanitizePath()`, `setNx()`/`getNx()` for Nexter framework

### Web Components

UI is built with Lit web components. Custom elements follow the `da-*` naming convention (e.g., `<da-browse>`, `<da-editor>`, `<da-title>`).

### Bundled Dependencies

The `deps/` directory contains custom-bundled dependencies:
- `deps/lit/` - Minified Lit library
- `deps/da-y-wrapper/` - Yjs + ProseMirror integration for collaborative editing

Import maps in `web-test-runner.config.js` map `da-y-wrapper` and `da-lit` to these bundles.

### External Dependencies

- **Nexter Framework** (`/nx`) - Adobe's framework providing IMS auth, style utilities
- **ProseMirror** - Rich text editing
- **Yjs** - CRDT-based collaborative editing via WebSocket
- **jspreadsheet-ce** - Spreadsheet component

## Testing

Unit tests use Web Test Runner with Mocha/Chai. Tests mirror the source structure under `test/unit/`.

External fetch/XHR requests are blocked in tests - mock external dependencies. See `web-test-runner.config.js` for the fetch interceptor.

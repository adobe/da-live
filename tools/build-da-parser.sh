#!/bin/bash
#
# Build da-parser bundle with shared dependency rewiring
#
# WHAT THIS DOES:
#   1. Bundles @da-tools/da-parser into an ESM module
#   2. Marks prosemirror/yjs dependencies as external (not bundled)
#   3. Rewrites import paths to use the shared da-y-wrapper
#
# WHY:
#   Browser environments can't have multiple instances of yjs/prosemirror.
#   All modules (da-parser, da-editor, etc.) must share the same singleton
#   instances. The da-y-wrapper re-exports all these libraries from one place,
#   ensuring a single shared instance across the application.
#
# USAGE:
#   ./tools/build-da-parser.sh
#   npm run build:da-parser
#

set -e

# Configuration
SOURCE="./node_modules/@da-tools/da-parser/src/index.js"
OUTPUT_DIR="./deps/da-parser/dist"
OUTPUT_TMP="$OUTPUT_DIR/index.tmp.js"
OUTPUT_FINAL="$OUTPUT_DIR/index.js"
WRAPPER_PATH="../../da-y-wrapper/dist/index.js"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

echo "Building da-parser bundle..."

# -----------------------------------------------------------------------------
# Step 1: Bundle with esbuild
# -----------------------------------------------------------------------------
# Bundle the parser source code, but keep certain dependencies external.
# External dependencies will remain as `import` statements in the output
# rather than being inlined into the bundle.
#
# Why external?
# - These libraries must be singletons (shared across all modules)
# - They'll be loaded from da-y-wrapper instead
# -----------------------------------------------------------------------------
esbuild \
  --format=esm \
  --minify \
  --bundle \
  --external:hast-util-from-html \
  --external:prosemirror-model \
  --external:prosemirror-schema-list \
  --external:prosemirror-tables \
  --external:y-prosemirror \
  --external:yjs \
  --external:y-protocols \
  --outfile="$OUTPUT_TMP" \
  "$SOURCE"

# -----------------------------------------------------------------------------
# Step 2: Rewrite import paths
# -----------------------------------------------------------------------------
# The esbuild output still has imports like:
#   import { Schema } from "prosemirror-model"
#
# We need to rewrite these to point to the shared wrapper:
#   import { Schema } from "../../da-y-wrapper/dist/index.js"
#
# This ensures all modules use the same singleton instances of these libraries.
# -----------------------------------------------------------------------------
sed \
  -e "s|from\"prosemirror-model\"|from\"$WRAPPER_PATH\"|g" \
  -e "s|from\"prosemirror-schema-list\"|from\"$WRAPPER_PATH\"|g" \
  -e "s|from\"prosemirror-tables\"|from\"$WRAPPER_PATH\"|g" \
  -e "s|from\"y-prosemirror\"|from\"$WRAPPER_PATH\"|g" \
  -e "s|from\"yjs\"|from\"$WRAPPER_PATH\"|g" \
  -e "s|import\"yjs\"|import\"$WRAPPER_PATH\"|g" \
  -e "s|from\"y-protocols/sync.js\"|from\"$WRAPPER_PATH\"|g" \
  -e "s|from\"y-protocols/awareness.js\"|from\"$WRAPPER_PATH\"|g" \
  "$OUTPUT_TMP" > "$OUTPUT_FINAL"

# -----------------------------------------------------------------------------
# Step 3: Cleanup
# -----------------------------------------------------------------------------
rm "$OUTPUT_TMP"

echo "Done: $OUTPUT_FINAL"

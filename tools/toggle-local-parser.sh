#!/bin/bash
#
# Toggle between local and npm versions of @da-tools/da-parser
#
# SETUP (one-time):
#   cd /path/to/da-tools/da-parser
#   npm link
#
# USAGE:
#   ./scripts/toggle-local-parser.sh local   # Use local da-parser and rebuild
#   ./scripts/toggle-local-parser.sh npm     # Use npm published version and rebuild
#   ./scripts/toggle-local-parser.sh status  # Check current state
#
# NOTE: This script also runs `npm run build:da-parser` after switching
#       to rebuild the bundled parser in deps/da-parser/dist/
#

set -e

PACKAGE="@da-tools/da-parser"

check_global_link() {
  # Check if da-parser is globally linked (setup step completed)
  if npm ls -g "$PACKAGE" --depth=0 2>/dev/null | grep -q "$PACKAGE"; then
    return 0
  else
    return 1
  fi
}

check_status() {
  if [ -L "node_modules/@da-tools/da-parser" ]; then
    target=$(readlink "node_modules/@da-tools/da-parser")
    echo "LOCAL: node_modules/@da-tools/da-parser -> $target"
  else
    echo "NPM: using published package"
  fi
}

case "$1" in
  local)
    if ! check_global_link; then
      echo "ERROR: Global link not found for $PACKAGE"
      echo ""
      echo "Run the one-time setup first:"
      echo "  cd /path/to/da-tools/da-parser"
      echo "  npm link"
      exit 1
    fi
    npm link "$PACKAGE"
    echo "Switched to LOCAL da-parser"
    check_status
    echo ""
    echo "Building da-parser bundle..."
    npm run build:da-parser
    echo "Done!"
    ;;
  npm)
    # Remove symlink manually instead of npm unlink (which can modify package.json in npm 7+)
    rm -rf "node_modules/@da-tools/da-parser"
    npm install
    echo "Switched to NPM da-parser"
    check_status
    echo ""
    echo "Building da-parser bundle..."
    npm run build:da-parser
    echo "Done!"
    ;;
  status)
    check_status
    ;;
  *)
    echo "Usage: $0 [local|npm|status]"
    echo ""
    echo "  local   - Use local da-parser and rebuild bundle"
    echo "  npm     - Use npm published version and rebuild bundle"
    echo "  status  - Check which version is currently in use"
    exit 1
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_SCRIPT="$ROOT_DIR/voiso-bot-script.js"
USER_SCRIPT="$ROOT_DIR/voiso-bot-script.user.js"
META_SCRIPT="$ROOT_DIR/voiso-bot-script.meta.js"
export LC_ALL=C
export LANG=C

usage() {
    cat <<USAGE
Usage:
  ./scripts/release-userscript.sh <version> [base_url]

Examples:
  ./scripts/release-userscript.sh 3.3.1
  ./scripts/release-userscript.sh 3.4.0 https://raw.githubusercontent.com/your-account/your-repo/main

Notes:
  - <version> must be SemVer (X.Y.Z)
  - [base_url] can also be provided through USERSCRIPT_BASE_URL env var
USAGE
}

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
    usage
    exit 1
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: version '$VERSION' is invalid. Use SemVer format X.Y.Z" >&2
    exit 1
fi

if [[ ! -f "$SOURCE_SCRIPT" ]]; then
    echo "Error: source script not found at $SOURCE_SCRIPT" >&2
    exit 1
fi

BASE_URL="${2:-${USERSCRIPT_BASE_URL:-}}"
if [[ -n "$BASE_URL" ]]; then
    BASE_URL="${BASE_URL%/}"
fi

replace_meta_line() {
    local field="$1"
    local value="$2"
    local format="$3"
    local tmp_file
    tmp_file="$(mktemp)"

    awk -v field="$field" -v value="$value" -v format="$format" '
        $0 ~ "^//[[:space:]]*" field "[[:space:]]+" {
            printf(format "\n", value);
            next;
        }
        { print; }
    ' "$SOURCE_SCRIPT" > "$tmp_file"

    mv "$tmp_file" "$SOURCE_SCRIPT"
}

replace_meta_line "@version" "$VERSION" "// @version      %s"

if [[ -n "$BASE_URL" ]]; then
    UPDATE_URL="$BASE_URL/voiso-bot-script.meta.js"
    DOWNLOAD_URL="$BASE_URL/voiso-bot-script.user.js"

    replace_meta_line "@updateURL" "$UPDATE_URL" "// @updateURL    %s"
    replace_meta_line "@downloadURL" "$DOWNLOAD_URL" "// @downloadURL  %s"
fi

cp "$SOURCE_SCRIPT" "$USER_SCRIPT"

awk '
    /^\/\/ ==UserScript==/ { in_block = 1 }
    in_block { print }
    /^\/\/ ==\/UserScript==/ { exit }
' "$SOURCE_SCRIPT" > "$META_SCRIPT"

echo "Release artifacts updated:"
echo "  - $SOURCE_SCRIPT"
echo "  - $USER_SCRIPT"
echo "  - $META_SCRIPT"
echo "Version: $VERSION"

if [[ -n "$BASE_URL" ]]; then
    echo "Update URLs set to: $BASE_URL"
else
    echo "Warning: base URL was not provided; @updateURL/@downloadURL were not changed."
fi

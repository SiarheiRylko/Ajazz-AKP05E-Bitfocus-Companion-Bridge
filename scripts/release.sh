#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <version>"
  exit 1
fi

VERSION="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/../akp05e-bridge-v${VERSION}"

echo "==> Preparing release v${VERSION} in ${OUT_DIR}"
rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}/plugin"
mkdir -p "${OUT_DIR}/scripts"

# Copy files
cp -v "${ROOT_DIR}/plugin/index.js" "${OUT_DIR}/plugin/index.js"
cp -v "${ROOT_DIR}/README.md" "${OUT_DIR}/README.md"
cp -v "${ROOT_DIR}/CHANGELOG.md" "${OUT_DIR}/CHANGELOG.md"
cp -v "${ROOT_DIR}/scripts/release.sh" "${OUT_DIR}/scripts/release.sh"

# Create zip
ZIP="${OUT_DIR}.zip"
echo "==> Creating archive ${ZIP}"
(cd "$(dirname "${OUT_DIR}")" && zip -rq "$(basename "${ZIP}")" "$(basename "${OUT_DIR}")")

# SHA256
if command -v shasum >/dev/null 2>&1; then
  SHASUM=$(shasum -a 256 "${ZIP}" | awk '{print $1}')
elif command -v sha256sum >/dev/null 2>&1; then
  SHASUM=$(sha256sum "${ZIP}" | awk '{print $1}')
else
  SHASUM="(sha256 tool not found)"
fi

echo "==> Done."
echo "Archive: ${ZIP}"
echo "SHA256:  ${SHASUM}"

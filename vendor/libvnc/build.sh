#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# ─────────────────────────────────────────────────────────────
# LibVNCClient Static Build Script for macOS arm64
#
# Downloads LibVNCServer source, compiles ONLY the client
# library as a static archive (.a) with minimal dependencies.
#
# Usage:
#   ./build.sh              # Build with defaults
#   ./build.sh --clean      # Clean and rebuild
#   ./build.sh --verify     # Build + verify checksum
#
# Output:
#   dist/lib/libvncclient.a
#   dist/include/rfb/*.h
#   dist/checksum.sha256
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ──────────────────────────────────────────

LIBVNC_VERSION="0.9.15"
LIBVNC_TAG="LibVNCServer-${LIBVNC_VERSION}"
LIBVNC_URL="https://github.com/LibVNC/libvncserver/archive/refs/tags/${LIBVNC_TAG}.tar.gz"
LIBVNC_SHA256=""  # Will be set after first verified build

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="${SCRIPT_DIR}/src"
BUILD_DIR="${SCRIPT_DIR}/build"
DIST_DIR="${SCRIPT_DIR}/dist"

MACOS_DEPLOYMENT_TARGET="14.0"
ARCH="arm64"
JOBS="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"

# ── Helpers ────────────────────────────────────────────────

log()   { printf '\033[1;34m==> %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
err()   { printf '\033[1;31m  ✗ %s\033[0m\n' "$*" >&2; }
die()   { err "$@"; exit 1; }

# ── Parse arguments ────────────────────────────────────────

CLEAN=false
VERIFY=false

for arg in "$@"; do
  case "$arg" in
    --clean)  CLEAN=true ;;
    --verify) VERIFY=true ;;
    --help|-h)
      echo "Usage: $0 [--clean] [--verify]"
      exit 0
      ;;
    *) die "Unknown argument: $arg" ;;
  esac
done

# ── Clean ──────────────────────────────────────────────────

if $CLEAN; then
  log "Cleaning previous build..."
  rm -rf "${SRC_DIR}" "${BUILD_DIR}" "${DIST_DIR}"
  ok "Clean complete"
fi

# ── Download source ────────────────────────────────────────

download_source() {
  if [[ -d "${SRC_DIR}/libvncserver-${LIBVNC_TAG}" ]]; then
    ok "Source already downloaded"
    return
  fi

  log "Downloading LibVNCServer ${LIBVNC_VERSION}..."
  mkdir -p "${SRC_DIR}"

  local tarball="${SRC_DIR}/${LIBVNC_TAG}.tar.gz"
  curl -fSL --retry 3 -o "${tarball}" "${LIBVNC_URL}"

  # Verify source checksum if set
  if [[ -n "${LIBVNC_SHA256}" ]]; then
    log "Verifying source checksum..."
    local actual
    actual="$(shasum -a 256 "${tarball}" | awk '{print $1}')"
    if [[ "${actual}" != "${LIBVNC_SHA256}" ]]; then
      die "Checksum mismatch! Expected: ${LIBVNC_SHA256}, Got: ${actual}"
    fi
    ok "Source checksum verified"
  fi

  tar xzf "${tarball}" -C "${SRC_DIR}"
  rm -f "${tarball}"
  ok "Source extracted"
}

# ── Detect libjpeg ─────────────────────────────────────────

detect_jpeg() {
  if command -v brew &>/dev/null; then
    local brew_prefix
    brew_prefix="$(brew --prefix jpeg-turbo 2>/dev/null || true)"
    if [[ -n "${brew_prefix}" && -d "${brew_prefix}" ]]; then
      JPEG_INCLUDE_DIR="${brew_prefix}/include"
      JPEG_LIBRARY="${brew_prefix}/lib/libjpeg.a"
      if [[ -f "${JPEG_LIBRARY}" ]]; then
        ok "Using Homebrew libjpeg-turbo: ${brew_prefix}"
        return
      fi
    fi
  fi

  # Disable JPEG if not found (non-critical)
  JPEG_INCLUDE_DIR=""
  JPEG_LIBRARY=""
  log "libjpeg not found — Tight encoding will be disabled (optional)"
}

# ── Detect OpenSSL ─────────────────────────────────────────

detect_openssl() {
  # Prefer Homebrew OpenSSL
  if command -v brew &>/dev/null; then
    local brew_prefix
    brew_prefix="$(brew --prefix openssl@3 2>/dev/null || brew --prefix openssl 2>/dev/null || true)"
    if [[ -n "${brew_prefix}" && -d "${brew_prefix}" ]]; then
      OPENSSL_ROOT_DIR="${brew_prefix}"
      ok "Using Homebrew OpenSSL: ${OPENSSL_ROOT_DIR}"
      return
    fi
  fi

  # Fallback: system
  if [[ -d "/usr/local/opt/openssl" ]]; then
    OPENSSL_ROOT_DIR="/usr/local/opt/openssl"
    ok "Using system OpenSSL: ${OPENSSL_ROOT_DIR}"
    return
  fi

  die "OpenSSL not found. Install with: brew install openssl@3"
}

# ── Build ──────────────────────────────────────────────────

build_libvncclient() {
  if [[ -f "${DIST_DIR}/lib/libvncclient.a" ]] && ! $CLEAN; then
    ok "libvncclient.a already built"
    return
  fi

  log "Configuring LibVNCClient (client-only, static, arm64)..."
  mkdir -p "${BUILD_DIR}"

  cmake -S "${SRC_DIR}/libvncserver-${LIBVNC_TAG}" \
        -B "${BUILD_DIR}" \
        -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_OSX_ARCHITECTURES="${ARCH}" \
        -DCMAKE_OSX_DEPLOYMENT_TARGET="${MACOS_DEPLOYMENT_TARGET}" \
        -DCMAKE_INSTALL_PREFIX="${DIST_DIR}" \
        -DBUILD_SHARED_LIBS=OFF \
        \
        -DWITH_LIBVNCCLIENT=ON \
        -DWITH_LIBVNCSERVER=OFF \
        \
        -DWITH_OPENSSL=ON \
        -DOPENSSL_ROOT_DIR="${OPENSSL_ROOT_DIR}" \
        -DWITH_ZLIB=ON \
        -DWITH_JPEG=ON \
        -DJPEG_INCLUDE_DIR="${JPEG_INCLUDE_DIR}" \
        -DJPEG_LIBRARY="${JPEG_LIBRARY}" \
        -DWITH_PNG=OFF \
        -DWITH_THREADS=ON \
        -DWITH_IPv6=ON \
        \
        -DWITH_GNUTLS=OFF \
        -DWITH_GCRYPT=OFF \
        -DWITH_SASL=OFF \
        -DWITH_LZO=OFF \
        -DWITH_WEBSOCKETS=OFF \
        -DWITH_SYSTEMD=OFF \
        -DWITH_XCB=OFF \
        -DWITH_FFMPEG=OFF \
        -DWITH_TIGHTVNC_FILETRANSFER=OFF \
        -DWITH_24BPP=ON \
        \
        -DWITH_SDL=OFF \
        -DWITH_GTK=OFF \
        -DWITH_QT=OFF \
        -DWITH_LIBSSHTUNNEL=OFF \
        -DWITH_EXAMPLES=OFF \
        -DWITH_TESTS=OFF \
        2>&1

  ok "Configuration complete"

  log "Building libvncclient (${JOBS} parallel jobs)..."
  cmake --build "${BUILD_DIR}" --target vncclient -j "${JOBS}" 2>&1

  ok "Build complete"

  log "Installing to ${DIST_DIR}..."
  mkdir -p "${DIST_DIR}/lib" "${DIST_DIR}/include/rfb"

  # Copy static library
  cp "${BUILD_DIR}/libvncclient.a" "${DIST_DIR}/lib/"

  # Copy public headers
  local hdr_root="${SRC_DIR}/libvncserver-${LIBVNC_TAG}/include/rfb"
  cp "${hdr_root}/rfbclient.h" "${DIST_DIR}/include/rfb/"
  cp "${hdr_root}/rfbproto.h"  "${DIST_DIR}/include/rfb/"
  cp "${hdr_root}/rfb.h"       "${DIST_DIR}/include/rfb/"
  cp "${hdr_root}/keysym.h"    "${DIST_DIR}/include/rfb/"
  cp "${hdr_root}/threading.h" "${DIST_DIR}/include/rfb/"
  cp "${hdr_root}/rfbregion.h" "${DIST_DIR}/include/rfb/"

  # Copy generated config header (cmake generates this from rfbconfig.h.cmakein)
  cp "${BUILD_DIR}/include/rfb/rfbconfig.h" "${DIST_DIR}/include/rfb/"

  ok "Install complete"
}

# ── Generate checksum ──────────────────────────────────────

generate_checksum() {
  log "Generating checksums..."
  mkdir -p "${DIST_DIR}"

  local checksum_file="${DIST_DIR}/checksum.sha256"

  (
    cd "${DIST_DIR}"
    find lib include -type f | sort | while read -r f; do
      shasum -a 256 "$f"
    done
  ) > "${checksum_file}"

  # Overall archive checksum
  local lib_hash
  lib_hash="$(shasum -a 256 "${DIST_DIR}/lib/libvncclient.a" | awk '{print $1}')"
  echo ""
  echo "libvncclient.a SHA256: ${lib_hash}"
  echo "${lib_hash}" > "${DIST_DIR}/libvncclient.sha256"

  ok "Checksums written to ${checksum_file}"
}

# ── Verify ─────────────────────────────────────────────────

verify_binary() {
  log "Verifying built binary..."

  local lib="${DIST_DIR}/lib/libvncclient.a"

  # Check file exists
  [[ -f "${lib}" ]] || die "libvncclient.a not found"

  # Check architecture
  local arch_info
  arch_info="$(lipo -info "${lib}" 2>&1)"
  echo "  Architecture: ${arch_info}"
  echo "${arch_info}" | grep -q "${ARCH}" || die "Wrong architecture"

  # Check it's a static library
  file "${lib}" | grep -q "archive" || die "Not a static archive"

  # Check exported symbols
  local sym_count
  sym_count="$(nm "${lib}" 2>/dev/null | grep -c ' T _rfb' || true)"
  echo "  RFB symbols: ${sym_count}"
  [[ "${sym_count}" -gt 0 ]] || die "No RFB symbols found"

  # List key symbols
  echo "  Key symbols:"
  nm "${lib}" 2>/dev/null | grep ' T _rfb' | head -10 | while read -r line; do
    echo "    ${line}"
  done

  ok "Binary verification passed"
}

# ── Summary ────────────────────────────────────────────────

print_summary() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  LibVNCClient ${LIBVNC_VERSION} — Build Summary"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Platform:  macOS ${MACOS_DEPLOYMENT_TARGET} (${ARCH})"
  echo "  Type:      static library"
  echo "  TLS:       OpenSSL (${OPENSSL_ROOT_DIR})"
  echo ""
  echo "  Files:"
  echo "    ${DIST_DIR}/lib/libvncclient.a"
  echo "    ${DIST_DIR}/include/rfb/"

  if [[ -f "${DIST_DIR}/libvncclient.sha256" ]]; then
    echo ""
    echo "  SHA256: $(cat "${DIST_DIR}/libvncclient.sha256")"
  fi

  local lib_size
  lib_size="$(du -h "${DIST_DIR}/lib/libvncclient.a" | awk '{print $1}')"
  echo "  Size:   ${lib_size}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ── Main ───────────────────────────────────────────────────

main() {
  log "LibVNCClient ${LIBVNC_VERSION} — Static Build for macOS ${ARCH}"
  echo ""

  detect_jpeg
  detect_openssl
  download_source
  build_libvncclient
  generate_checksum

  if $VERIFY; then
    verify_binary
  fi

  print_summary
}

main

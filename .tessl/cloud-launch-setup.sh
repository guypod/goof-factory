#!/usr/bin/env bash
set -eo pipefail

echo "[goof setup] verify baseline tools"
node --version
npm --version
docker --version
uv --version

echo "[goof setup] install Node dependencies with npm ci"
npm ci

echo "[goof setup] build browser bundle"
npm run build

echo "[goof setup] install pinned Semgrep OSS CLI with uv"
# Semgrep 1.92 instrumentation imports pkg_resources, removed from setuptools 81.
uv tool install --force --python python3.12 --with setuptools==80.9.0 semgrep==1.92.0
mkdir -p "$HOME/.local/bin"
if ! command -v semgrep >/dev/null 2>&1 && [ -x "$HOME/.local/bin/semgrep" ]; then
  echo "[goof setup] semgrep installed at $HOME/.local/bin/semgrep"
fi
"$HOME/.local/bin/semgrep" --version

echo "[goof setup] runtime harness is available at runtime/run-local.sh"

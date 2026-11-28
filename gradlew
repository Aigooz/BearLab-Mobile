#!/bin/sh
set -e
if [ -n "${GRADLE_BIN:-}" ] && [ -x "$GRADLE_BIN" ]; then
  exec "$GRADLE_BIN" "$@"
fi
if command -v gradle >/dev/null 2>&1; then
  exec gradle "$@"
fi
echo "Gradle is not installed. Set GRADLE_BIN or install Gradle 8.9." >&2
exit 1

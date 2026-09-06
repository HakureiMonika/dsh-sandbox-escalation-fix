#!/bin/sh
# Linux/macOS installer for dsh-sandbox-escalation-fix. Equivalent of install-release.ps1.
# Usage: sh ./install-release.sh [profile]   (default profile: web)
set -eu

profile="${1:-web}"
package_name='dsh-sandbox-escalation-fix'
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

count=$(find "$script_dir" -maxdepth 1 -name "$package_name-*.tgz" -type f | wc -l | tr -d '[:space:]')
if [ "$count" -ne 1 ]; then
  echo "Expected exactly one $package_name-*.tgz beside this script, found $count." >&2
  exit 1
fi
tarball=$(find "$script_dir" -maxdepth 1 -name "$package_name-*.tgz" -type f)

echo "Installing $(basename "$tarball") into profile '$profile'."
# DSH CLI installs the local tgz into the profile and syncs the dsh.bundle patch layer after pnpm succeeds.
if dsh plugin --profile "$profile" add "$tarball"; then
  echo "DSH plugin installation finished. Restart DSH before use."
else
  status=$?
  echo "DSH plugin installation finished with exit code $status." >&2
  exit "$status"
fi

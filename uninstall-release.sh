#!/bin/sh
# Linux/macOS uninstaller for dsh-sandbox-escalation-fix. Equivalent of uninstall-release.ps1.
# Usage: sh ./uninstall-release.sh [profile]   (default profile: web)
set -eu

profile="${1:-web}"
package_name='dsh-sandbox-escalation-fix'

echo "Removing $package_name from profile '$profile'."
# DSH CLI removes the profile dependency and deletes the plugin from the dsh.bundle patch layer.
if dsh plugin --profile "$profile" remove "$package_name"; then
  echo "DSH plugin removal finished. Restart DSH before use."
else
  status=$?
  echo "DSH plugin removal finished with exit code $status." >&2
  exit "$status"
fi

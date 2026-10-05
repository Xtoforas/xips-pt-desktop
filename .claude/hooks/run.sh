#!/bin/sh
# Run a hook script with whichever Python 3.11+ this machine has: python3 on
# macOS/Linux, python on Windows. The probe's output is discarded so the Windows
# Store stub can't leak text into the hook's JSON. No usable Python: fail open.
for py in python3 python; do
  if "$py" -c 'import sys; sys.exit(sys.version_info < (3, 11))' >/dev/null 2>&1; then
    exec "$py" "$@"
  fi
done
echo "hook skipped: no Python 3.11+ found as python3 or python" >&2
exit 0

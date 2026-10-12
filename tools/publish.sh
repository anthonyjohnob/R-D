#!/usr/bin/env bash
# Build R/D, run every check, and copy the website into a checkout of the `main` branch
# (the branch GitHub Pages serves). Stops on the first failure. Review the diff, then commit and push
# from the pages checkout — the site updates a minute or two after the push.
#
#   tools/publish.sh            # pages checkout defaults to ../rd-pages (cloned if missing)
#   PAGES_DIR=/path tools/publish.sh
set -euo pipefail
cd "$(dirname "$0")/.."
pages="${PAGES_DIR:-../rd-pages}"

python3 build.py
for t in test/*.test.js; do node "$t" | tail -1; done
python3 scratch/site_test.py | tee /dev/stderr | grep -q '^no console errors$'
python3 scratch/clear_review_e2e.py | tee /dev/stderr | grep -q '^ALL PASS$'
python3 scratch/tumor_e2e.py | tee /dev/stderr | grep -q '^ALL PASS$'
python3 scratch/buckle_e2e.py | tee /dev/stderr | grep -q '^ALL PASS$'
python3 scratch/breaks_e2e.py | tee /dev/stderr | grep -q '^ALL PASS$'
python3 scratch/handtools_e2e.py | tee /dev/stderr | grep -q '^ALL PASS$'

if [ ! -d "$pages/.git" ]; then
  git clone --branch main https://github.com/anthonyjohnob/R-D "$pages"
fi
git -C "$pages" pull --ff-only origin main
# every published update is a new version with its own entry in src/changelog.js
new_ver=$(python3 -c "import json; print(json.load(open('dist/site/version.json'))['version'])")
if [ -f "$pages/version.json" ]; then
  old_ver=$(python3 -c "import json, sys; print(json.load(open(sys.argv[1]))['version'])" "$pages/version.json")
  if [ "$old_ver" = "$new_ver" ]; then echo "Version $new_ver is already live — add an entry to src/changelog.js first." >&2; exit 1; fi
fi
echo "Publishing R/D version $new_ver"
find "$pages" -mindepth 1 -maxdepth 1 ! -name .git ! -name README.md -exec rm -rf {} +
cp -r dist/site/. "$pages"/
rm -f "$pages/README.txt"
git -C "$pages" add -A
git -C "$pages" status --short
echo "Ready: commit and push from $pages (author: anthonyjohnob noreply address)."

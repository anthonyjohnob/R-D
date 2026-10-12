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

if [ ! -d "$pages/.git" ]; then
  git clone --branch main https://github.com/anthonyjohnob/R-D "$pages"
fi
git -C "$pages" pull --ff-only origin main
find "$pages" -mindepth 1 -maxdepth 1 ! -name .git ! -name README.md -exec rm -rf {} +
cp -r dist/site/. "$pages"/
rm -f "$pages/README.txt"
git -C "$pages" add -A
git -C "$pages" status --short
echo "Ready: commit and push from $pages (author: anthonyjohnob noreply address)."

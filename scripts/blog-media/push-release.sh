#!/usr/bin/env bash
# Publish new or changed blog media (long videos, narration) as assets of the GitHub Release media-v1.
# How: commits the files that are missing from the release (or differ in size) to a temporary orphan branch
# `blog-media-upload`, together with a workflow that runs on that push, uploads them with `gh release upload --clobber`
# and then deletes the branch. The branch carries a vercel.json that turns Vercel deployments off for it.
# Use this when the uploads API is not reachable directly; with a token, scripts/blog-media/upload.sh does the same in place.
#   bash scripts/blog-media/push-release.sh [slug ...]
set -euo pipefail
cd "$(dirname "$0")"
REPO=aniruddhaadak80/OpenFile
TAG=media-v1
BR=blog-media-upload
SRC=$PWD/.cache/release
WORK=$PWD/.cache/upload-repo
CA=(); [ -n "${SSL_CERT_FILE:-}" ] && CA=(--cacert "$SSL_CERT_FILE")
api() { curl -sS "${CA[@]}" -H "Accept: application/vnd.github+json" "$@"; }
RID=$(api "https://api.github.com/repos/$REPO/releases/tags/$TAG" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
EXIST=$(for p in 1 2 3 4 5; do api "https://api.github.com/repos/$REPO/releases/$RID/assets?per_page=100&page=$p" > "/tmp/of-assets-$p.json"; python3 -c '
import sys,json
for a in json.load(open(sys.argv[1])): print(a["name"], a["size"])' "/tmp/of-assets-$p.json"; done)
rm -rf "$WORK"; mkdir -p "$WORK/media" "$WORK/.github/workflows"
shopt -s nullglob
if [ $# -gt 0 ]; then files=(); for s in "$@"; do files+=("$SRC/$s".mp4 "$SRC/$s".webm "$SRC/$s"-*.mp3 "$SRC/$s"-*.opus); done
else files=("$SRC"/*.mp4 "$SRC"/*.webm "$SRC"/*.mp3 "$SRC"/*.opus); fi
n=0
for f in "${files[@]}"; do
  [ -f "$f" ] || continue
  b=$(basename "$f"); sz=$(stat -c %s "$f")
  if echo "$EXIST" | grep -qx "$b $sz"; then continue; fi
  cp "$f" "$WORK/media/$b"; n=$((n+1))
done
if [ "$n" = 0 ]; then echo "push-release: release is up to date"; exit 0; fi
cat > "$WORK/vercel.json" <<'JSON'
{ "git": { "deploymentEnabled": false } }
JSON
cat > "$WORK/.github/workflows/blog-media-upload.yml" <<'YML'
name: Blog media upload
on:
  push:
    branches: [blog-media-upload]
permissions:
  contents: write
jobs:
  upload:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with: { lfs: false }
      - name: Upload to the media-v1 release
        env: { GH_TOKEN: "${{ github.token }}" }
        run: |
          ls -la media | head -50
          gh release upload media-v1 media/* --clobber -R "$GITHUB_REPOSITORY"
      - name: Delete this temporary branch
        if: success()
        run: git push origin --delete blog-media-upload
YML
cd "$WORK"
git init -q -b "$BR"
git add -A
git -c user.name=aniruddhaadak80 -c user.email=127435065+aniruddhaadak80@users.noreply.github.com commit -qm "Blog media: $n files for release $TAG"
git -c http.sslCAInfo="${SSL_CERT_FILE:-}" -c http.postBuffer=524288000 push -f "https://github.com/$REPO.git" "$BR:$BR" 2>&1 | tail -3
echo "push-release: pushed $n files on $BR; the Blog media upload workflow uploads them and deletes the branch"

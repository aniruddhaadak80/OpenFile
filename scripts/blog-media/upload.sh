#!/usr/bin/env bash
# Upload new or changed blog media (long videos and narration) to the GitHub Release tagged media-v1.
# Assets with the same name and size are skipped; a changed file replaces the old asset.
# Needs GitHub auth on the wire (Hark sandbox: run with github credentials) or GITHUB_TOKEN in the environment.
#   bash scripts/blog-media/upload.sh            # everything in scripts/blog-media/.cache/release
#   bash scripts/blog-media/upload.sh slug ...   # only files for these posts
set -euo pipefail
cd "$(dirname "$0")"
REPO=aniruddhaadak80/OpenFile
TAG=media-v1
DIR=.cache/release
CA=(); [ -n "${SSL_CERT_FILE:-}" ] && CA=(--cacert "$SSL_CERT_FILE")
AUTH=(); [ -n "${GITHUB_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $GITHUB_TOKEN")
api() { curl -sS "${CA[@]}" "${AUTH[@]}" -H "Accept: application/vnd.github+json" "$@"; }
REL=$(api "https://api.github.com/repos/$REPO/releases/tags/$TAG")
RID=$(echo "$REL" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
# all existing assets (paged)
EXIST=$(for p in 1 2 3 4 5; do api "https://api.github.com/repos/$REPO/releases/$RID/assets?per_page=100&page=$p"; done | python3 -c '
import sys,json
dec=json.JSONDecoder(); s=sys.stdin.read(); i=0; out={}
while i < len(s):
    while i < len(s) and s[i].isspace(): i+=1
    if i>=len(s): break
    o,j=dec.raw_decode(s,i); i=j
    for a in o: out[a["name"]]=(a["id"],a["size"])
for k,(i_,sz) in out.items(): print(k,i_,sz)')
shopt -s nullglob
files=()
if [ $# -gt 0 ]; then for s in "$@"; do files+=("$DIR/$s".mp4 "$DIR/$s".webm "$DIR/$s"-*.mp3 "$DIR/$s"-*.opus); done; else files=("$DIR"/*.mp4 "$DIR"/*.webm "$DIR"/*.mp3 "$DIR"/*.opus); fi
up=0; skip=0
for f in "${files[@]}"; do
  [ -f "$f" ] || continue
  n=$(basename "$f"); sz=$(stat -c %s "$f")
  line=$(echo "$EXIST" | awk -v n="$n" '$1==n{print $2, $3}')
  if [ -n "$line" ]; then
    id=${line% *}; esz=${line#* }
    if [ "$esz" = "$sz" ]; then skip=$((skip+1)); continue; fi
    api -X DELETE "https://api.github.com/repos/$REPO/releases/assets/$id" >/dev/null
  fi
  case "$n" in *.mp4) ct=video/mp4;; *.webm) ct=video/webm;; *.mp3) ct=audio/mpeg;; *.opus) ct=audio/ogg;; *) ct=application/octet-stream;; esac
  code=$(curl -sS "${CA[@]}" "${AUTH[@]}" -o /tmp/up.json -w '%{http_code}' -X POST -H "Content-Type: $ct" --data-binary @"$f" "https://uploads.github.com/repos/$REPO/releases/$RID/assets?name=$n")
  if [ "$code" != "201" ]; then echo "FAILED $n ($code): $(head -c 300 /tmp/up.json)"; exit 1; fi
  up=$((up+1)); echo "uploaded $n ($sz bytes)"
done
echo "upload: $up uploaded, $skip unchanged"

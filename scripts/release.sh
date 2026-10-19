#!/usr/bin/env bash
# 사용법: scripts/release.sh 0.1.1
#  1) 버전 갱신 → 커밋 → 태그 → 푸시 (태그가 이미 있으면 건너뜀 — 중간에 실패해도 같은 명령으로 다시 실행)
#  2) GitHub Actions 릴리스가 끝나길 기다림
#  3) 릴리스의 SHA-256으로 homebrew-tap / scoop-bucket 매니페스트를 갱신해 각 레포에 푸시
set -euo pipefail
V="${1:?버전을 주세요 (예: 0.1.1)}"
[[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "버전 형식은 0.1.1 처럼: $V" >&2; exit 1; }
OWNER=LeeKwang-min
REPO="$OWNER/desktop-ber"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LICENSE_ID="$(node -p "require('./package.json').license")"

if git rev-parse -q --verify "refs/tags/v$V" >/dev/null; then
  echo "태그 v${V}가 이미 있어 버전 갱신을 건너뜁니다"
else
  [ "$(git branch --show-current)" = main ] || { echo "main 브랜치에서 실행하세요" >&2; exit 1; }
  [ -z "$(git status --porcelain)" ] || { echo "커밋하지 않은 변경이 있습니다" >&2; exit 1; }
  node -e "for (const f of ['package.json','src-tauri/tauri.conf.json']) { const j=require('./'+f); j.version='$V'; require('fs').writeFileSync(f, JSON.stringify(j,null,2)+'\n'); }"
  node -e "const fs=require('fs'),f='src-tauri/Cargo.toml'; fs.writeFileSync(f, fs.readFileSync(f,'utf8').replace(/^version = \".*\"$/m, 'version = \"$V\"'))"
  (cd src-tauri && cargo update -p ber --offline >/dev/null 2>&1 || true)
  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
  git diff --cached --quiet || git commit -m "chore: release v$V"
  git tag "v$V"
fi
git push origin main "v$V"

echo "릴리스 빌드를 기다립니다..."
RUN_ID=""
for _ in $(seq 1 24); do
  RUN_ID="$(gh run list --repo "$REPO" --workflow release.yml --branch "v$V" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"
  [ -n "$RUN_ID" ] && break
  sleep 5
done
[ -n "$RUN_ID" ] || { echo "release.yml 실행을 찾지 못했습니다 (v$V)" >&2; exit 1; }
gh run watch "$RUN_ID" --repo "$REPO" --exit-status

TMP="$(mktemp -d)"
gh release download "v$V" --repo "$REPO" --pattern '*.sha256' --dir "$TMP"
MAC_SHA="$(cat "$TMP/Ber-$V-mac.zip.sha256")"
WIN_SHA="$(cat "$TMP/Ber-$V-windows-x64.zip.sha256")"

# $1 레포, $2 레포 안 경로, 나머지: sed 인자
publish() {
  local repo="$1" path="$2"; shift 2
  local dir="$TMP/$repo"
  gh repo clone "$OWNER/$repo" "$dir" -- --depth 1
  # 임시 클론은 전역 git 설정을 쓰므로 이 레포의 작성자(noreply 주소)를 그대로 넘긴다
  git -C "$dir" config user.name "$(git config user.name)"
  git -C "$dir" config user.email "$(git config user.email)"
  mkdir -p "$dir/$(dirname "$path")"
  sed "$@" > "$dir/$path"
  git -C "$dir" add "$path"
  if git -C "$dir" diff --cached --quiet; then echo "$repo: 이미 최신"; return; fi
  git -C "$dir" commit -m "ber $V"
  git -C "$dir" push
}
publish homebrew-tap Casks/ber.rb -e "s/@VERSION@/$V/g" -e "s/@SHA256@/$MAC_SHA/g" packaging/homebrew/ber.rb
publish scoop-bucket bucket/ber.json -e "s/@VERSION@/$V/g" -e "s/@SHA256@/$WIN_SHA/g" -e "s/@LICENSE@/$LICENSE_ID/g" packaging/scoop/ber.json

echo "완료: v$V (mac $MAC_SHA / windows $WIN_SHA)"

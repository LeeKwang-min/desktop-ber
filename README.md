# 베르 (Ber)

화면 위를 돌아다니는 검은 턱시도 고양이 **베르**. 대부분 자거나 식빵을 굽고, 가끔 일어나 돌아다니며, 커서를 쫓고, 쓰다듬으면 골골송을 부릅니다. 다른 앱 창의 제목 표시줄 위에서 자기도 하고 창 밑에 숨기도 해요.

## 설치

### macOS (14 이상)
1. [Homebrew](https://brew.sh/ko/)가 없다면 터미널에 붙여넣기:
   ```
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
2. 베르 설치:
   ```
   brew install --cask leekwang-min/tap/ber
   ```
3. 응용 프로그램 폴더(또는 Spotlight)에서 **Ber**를 실행하면 메뉴바에 고양이 얼굴 아이콘이 생깁니다.

### Windows 10/11
1. 시작 메뉴에서 **PowerShell**을 열고 Scoop 설치(처음 한 번):
   ```
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   irm get.scoop.sh | iex
   ```
2. 베르 설치:
   ```
   scoop install git
   scoop bucket add ber https://github.com/LeeKwang-min/scoop-bucket
   scoop install ber/ber
   ```
3. 시작 메뉴의 **베르**를 실행하면 작업 표시줄 알림 영역에 아이콘이 생깁니다. Windows 11에서 아이콘이 안 보이면 작업 표시줄 오른쪽의 **^** 를 눌러 보세요.

## 업데이트·삭제
| | macOS | Windows |
|---|---|---|
| 업데이트 | `brew upgrade --cask ber` 후 **Ber** 다시 실행 | 아이콘 메뉴에서 **종료** → `scoop update ber` → 시작 메뉴에서 **베르** 실행 |
| 삭제 | `brew uninstall --zap --cask ber` | 아이콘 메뉴에서 **종료** → `scoop uninstall ber` |

macOS는 업데이트·삭제할 때 베르를 알아서 종료합니다. Windows는 베르가 켜져 있으면 Scoop이 파일을 바꾸지 못하므로 먼저 종료해 주세요.

## 메뉴
메뉴바(Windows는 알림 영역)의 베르 아이콘:
- **이리 와** — 커서 쪽으로 달려와 앉아요
- **숨기기 / 보이기**
- **활동량** — 실제 고양이처럼(기본) / 반반 / 활발하게
- **크기** — 작게 / 보통 / 크게
- **로그인 시 실행**
- **종료**

## 알아두기
- 베르 위가 아닌 곳의 클릭은 아래 앱으로 그대로 갑니다.
- macOS에서는 베르를 클릭하면 포커스가 잠깐 베르로 넘어갑니다. 하던 창을 다시 클릭하면 돼요.
- 전체화면 앱(영상 등) 위에서는 베르가 보이지 않을 수 있어요.
- Windows "스마트 앱 컨트롤"이 켜진 PC에서는 서명되지 않은 앱이라 실행이 막힐 수 있습니다.

## 개발
```
pnpm install
pnpm tauri dev          # 앱 실행
pnpm dev                # 브라우저에서 http://localhost:1420/?gallery 로 자세 갤러리
pnpm test && (cd src-tauri && cargo test)
```
설계: `docs/superpowers/specs/2026-10-16-ber-desktop-cat-design.md`

## 라이선스
MIT

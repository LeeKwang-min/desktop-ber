cask "ber" do
  version "@VERSION@"
  sha256 "@SHA256@"

  url "https://github.com/LeeKwang-min/desktop-ber/releases/download/v#{version}/Ber-#{version}-mac.zip"
  name "Ber"
  name "베르"
  desc "화면 위를 돌아다니는 턱시도 고양이 베르"
  homepage "https://github.com/LeeKwang-min/desktop-ber"

  depends_on macos: ">= :sonoma"

  app "Ber.app"

  # 공증하지 않은 앱이라 설치 직후 격리 표시를 지워 Gatekeeper 경고 없이 실행되게 한다
  postflight do
    system_command "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "#{appdir}/Ber.app"]
  end

  uninstall quit: "com.leekwangmin.ber"

  zap trash: [
    "~/Library/Application Support/com.leekwangmin.ber",
    "~/Library/Caches/com.leekwangmin.ber",
    "~/Library/WebKit/com.leekwangmin.ber",
    "~/Library/LaunchAgents/Ber.plist",
  ]
end

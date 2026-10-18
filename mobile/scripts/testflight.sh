#!/bin/zsh
# Build Magno for the App Store and upload it to TestFlight, from this Mac, with the Apple account signed into Xcode.
# Copied from Liber's (lingua-native mobile/scripts/testflight.sh), which has the notes on first-time traps.
#
#   mobile/scripts/testflight.sh
#
# Needs: Xcode signed in (Settings > Accounts), the App ID app.magno.ios registered (developer.apple.com > Identifiers)
# and the app record in App Store Connect. Each upload needs a new build number; this bumps ios.buildNumber in app.json
# and leaves it bumped.
set -euo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 # CocoaPods fails under the C locale
cd "$(dirname "$0")/.."

if [[ -n "${1:-}" ]]; then
  node -e 'const f="app.json",j=require("./"+f);j.expo.ios.appleTeamId=process.argv[1];require("fs").writeFileSync(f,JSON.stringify(j,null,2)+"\n")' "$1"
fi
TEAM=$(node -p 'require("./app.json").expo.ios.appleTeamId || ""')
[[ -n "$TEAM" ]] || { echo "No team yet: run with your Team ID (developer.apple.com/account, Membership details)"; exit 1; }

BUILD=$(node -e 'const f="app.json",j=require("./"+f);j.expo.ios.buildNumber=String(Number(j.expo.ios.buildNumber||0)+1);require("fs").writeFileSync(f,JSON.stringify(j,null,2)+"\n");console.log(j.expo.ios.buildNumber)')
echo "Team $TEAM, build $BUILD"

npx expo prebuild -p ios --clean
OUT=build/testflight
rm -rf "$OUT" && mkdir -p "$OUT"
xcodebuild -workspace ios/Magno.xcworkspace -scheme Magno -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$OUT/Magno.xcarchive" -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic archive -quiet

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>$TEAM</string>
  <key>uploadSymbols</key><true/>
</dict></plist>
PLIST
xcodebuild -exportArchive -archivePath "$OUT/Magno.xcarchive" -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$OUT/export" -allowProvisioningUpdates
echo "Uploaded build $BUILD. It shows in App Store Connect > TestFlight after Apple processes it (about 10 to 30 minutes)."

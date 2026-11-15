#!/bin/bash
# Builds SnowDesk.app and SnowDesk.dmg from main.swift
set -e
cd "$(dirname "$0")"
APP="SnowDesk.app"
rm -rf build "$APP" SnowDesk.dmg dmgroot
mkdir -p build

echo "- compiling arm64"
swiftc -O -target arm64-apple-macos13.0 main.swift -o build/SnowDesk-arm64
if swiftc -O -target x86_64-apple-macos13.0 main.swift -o build/SnowDesk-x86_64 2>/dev/null; then
  echo "- compiling x86_64 (universal build)"
  lipo -create build/SnowDesk-arm64 build/SnowDesk-x86_64 -output build/SnowDesk
else
  echo "- x86_64 build unavailable, arm64 only"
  cp build/SnowDesk-arm64 build/SnowDesk
fi

echo "- icon"
swiftc make_icon.swift -o build/make_icon
build/make_icon build/AppIcon.iconset
iconutil -c icns build/AppIcon.iconset -o build/AppIcon.icns

echo "- bundle"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp build/SnowDesk "$APP/Contents/MacOS/SnowDesk"
cp Info.plist "$APP/Contents/Info.plist"
cp build/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
codesign --force --deep --sign - "$APP"

echo "- dmg"
mkdir dmgroot
cp -R "$APP" dmgroot/
ln -s /Applications dmgroot/Applications
cp "Read Me.txt" dmgroot/
hdiutil create -volname "SnowDesk" -srcfolder dmgroot -ov -format UDZO SnowDesk.dmg > /dev/null
rm -rf dmgroot
echo "done"

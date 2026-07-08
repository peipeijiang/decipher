#!/bin/bash
set -e

APP_NAME="Decipher"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."
DMG_DIR="$PROJECT_DIR/dist-dmg"
STAGING="$DMG_DIR/staging"

echo "📦 Packaging Decipher.app..."

rm -rf "$STAGING" "$DMG_DIR/$APP_NAME.app" "$DMG_DIR/$APP_NAME.dmg"

# Create .app structure
APP_CONTENTS="$STAGING/$APP_NAME.app/Contents"
mkdir -p "$APP_CONTENTS/MacOS"
mkdir -p "$APP_CONTENTS/Resources/app"

DEST="$APP_CONTENTS/Resources/app"

echo "  Copying backend..."
mkdir -p "$DEST/backend/app"
cp -R "$PROJECT_DIR/backend/app" "$DEST/backend/"
cp "$PROJECT_DIR/backend/main.py" "$DEST/backend/"
cp "$PROJECT_DIR/backend/packaged_main.py" "$DEST/backend/"
cp "$PROJECT_DIR/backend/requirements.txt" "$DEST/backend/"
cp "$PROJECT_DIR/backend/.env.example" "$DEST/backend/" 2>/dev/null || true
# Create empty dirs (user data dirs)
mkdir -p "$DEST/backend/uploads"
mkdir -p "$DEST/backend/processed"

echo "  Copying frontend..."
mkdir -p "$DEST/frontend"
cp -R "$PROJECT_DIR/frontend/dist" "$DEST/frontend/dist"
cp "$PROJECT_DIR/frontend/package.json" "$DEST/frontend/" 2>/dev/null || true

echo "  Copying scripts..."
cp "$PROJECT_DIR/decipher.sh" "$DEST/"
cp "$PROJECT_DIR/README.md" "$DEST/" 2>/dev/null || true
cp "$PROJECT_DIR/AGENTS.md" "$DEST/" 2>/dev/null || true

# Clean pycache
find "$DEST" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
find "$DEST" -name '*.pyc' -delete 2>/dev/null || true

# Create launcher
cat > "$APP_CONTENTS/MacOS/Decipher" << 'LAUNCHER'
#!/bin/bash
DIR="$(cd "$(dirname "$0")/../Resources/app" && pwd)"
exec "$DIR/decipher.sh"
LAUNCHER
chmod +x "$APP_CONTENTS/MacOS/Decipher"

# Info.plist
cat > "$APP_CONTENTS/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>Decipher</string>
    <key>CFBundleIdentifier</key>
    <string>com.peipeijiang.decipher</string>
    <key>CFBundleName</key>
    <string>Decipher</string>
    <key>CFBundleDisplayName</key>
    <string>Decipher</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

# Move .app out of staging
mv "$STAGING/$APP_NAME.app" "$DMG_DIR/$APP_NAME.app"
rm -rf "$STAGING"

APP_SIZE=$(du -sh "$DMG_DIR/$APP_NAME.app" | cut -f1)
echo "  App bundle: $APP_SIZE"

# Create DMG
echo "📀 Creating DMG..."
hdiutil create -volname "$APP_NAME" \
    -srcfolder "$DMG_DIR/$APP_NAME.app" \
    -ov -format UDZO \
    "$DMG_DIR/$APP_NAME.dmg" 2>&1

SIZE=$(du -sh "$DMG_DIR/$APP_NAME.dmg" | cut -f1)
echo ""
echo "✅ Done: $DMG_DIR/$APP_NAME.dmg ($SIZE)"
echo "   Double-click to mount → drag to /Applications → double-click Decipher"

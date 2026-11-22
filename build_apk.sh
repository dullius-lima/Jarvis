#!/usr/bin/env bash
set -e
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which javac))))
export ANDROID_HOME=/home/ubuntu/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
echo "☕ JAVA_HOME: $JAVA_HOME"
echo "sdk.dir=/home/ubuntu/android-sdk" > android/local.properties

rm -rf public/download dist/public/download android/app/src/main/assets/public
npm run build:frontend

mkdir -p android/app/src/main/assets/public
cp -rf dist/index.html dist/settings.html dist/assets android/app/src/main/assets/public/ 2>/dev/null || true

cd android
chmod +x gradlew
./gradlew assembleDebug
mkdir -p /home/ubuntu/jarvis_releases ../dist/public/download
cp -f app/build/outputs/apk/debug/app-debug.apk /home/ubuntu/jarvis_releases/jarvis.apk
cp -f app/build/outputs/apk/debug/app-debug.apk ../dist/public/download/jarvis.apk
chmod 644 /home/ubuntu/jarvis_releases/jarvis.apk ../dist/public/download/jarvis.apk
echo "✅ APK compilado com sucesso (sem server.js embutido)!"
ls -lh /home/ubuntu/jarvis_releases/jarvis.apk

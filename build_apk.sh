#!/usr/bin/env bash
set -e
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which javac))))
export ANDROID_HOME=/home/ubuntu/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
echo "☕ JAVA_HOME: $JAVA_HOME"
echo "sdk.dir=/home/ubuntu/android-sdk" > android/local.properties

rm -rf public/download dist/public/download android/app/src/main/assets/public
npm run build:frontend

if [ -x "./node_modules/.bin/cap" ]; then
  ./node_modules/.bin/cap sync android || { mkdir -p android/app/src/main/assets/public && cp -rf dist/* android/app/src/main/assets/public/; }
else
  mkdir -p android/app/src/main/assets/public
  cp -rf dist/* android/app/src/main/assets/public/
fi

cd android
chmod +x gradlew
./gradlew assembleDebug
mkdir -p /home/ubuntu/jarvis_releases ../dist/public/download
cp -f app/build/outputs/apk/debug/app-debug.apk /home/ubuntu/jarvis_releases/jarvis.apk
cp -f app/build/outputs/apk/debug/app-debug.apk ../dist/public/download/jarvis.apk
chmod 644 /home/ubuntu/jarvis_releases/jarvis.apk ../dist/public/download/jarvis.apk
echo "✅ APK v1.7.7 compilado com sucesso!"
ls -lh /home/ubuntu/jarvis_releases/jarvis.apk

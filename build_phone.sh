#!/usr/bin/env bash
set -e
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which javac))))
export ANDROID_HOME=/home/ubuntu/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
echo "sdk.dir=/home/ubuntu/android-sdk" > android/local.properties

rm -rf android/app/src/main/java/com/matheus/jarvis/*
cp -f devices/phone/java/com/matheus/jarvis/* android/app/src/main/java/com/matheus/jarvis/
cp -f devices/phone/AndroidManifest.xml android/app/src/main/AndroidManifest.xml
mkdir -p android/app/src/main/res/xml
cp -rf devices/phone/res/xml/* android/app/src/main/res/xml/ 2>/dev/null || true

# Remove WebView assets pesados (app usa apenas Globo 3D nativo + Chrome)
rm -rf public/download dist/public/download android/app/src/main/assets/public android/app/build

(cd android && chmod +x gradlew && ./gradlew assembleDebug)
mkdir -p /home/ubuntu/jarvis_releases dist/public/download
cp -f android/app/build/outputs/apk/debug/app-debug.apk /home/ubuntu/jarvis_releases/jarvis.apk
cp -f android/app/build/outputs/apk/debug/app-debug.apk dist/public/download/jarvis.apk
chmod 644 /home/ubuntu/jarvis_releases/jarvis.apk dist/public/download/jarvis.apk
ls -lh /home/ubuntu/jarvis_releases/jarvis.apk

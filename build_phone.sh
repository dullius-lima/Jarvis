#!/usr/bin/env bash
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which javac))))
export ANDROID_HOME=/home/ubuntu/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
echo "sdk.dir=/home/ubuntu/android-sdk" > android/local.properties

rm -rf android/app/src/main/java/com/matheus/jarvis/*
cp -f devices/phone/java/com/matheus/jarvis/* android/app/src/main/java/com/matheus/jarvis/
cp -f devices/phone/AndroidManifest.xml android/app/src/main/AndroidManifest.xml
mkdir -p android/app/src/main/res/xml
cp -rf devices/phone/res/xml/* android/app/src/main/res/xml/ 2>/dev/null || true

rm -rf public/download dist/public/download android/app/src/main/assets/public android/app/build/outputs/apk/debug/app-debug.apk
npm run build:frontend > /tmp/build_phone.log 2>&1 || { echo "Erro Vite:"; tail -n 15 /tmp/build_phone.log; exit 1; }
mkdir -p android/app/src/main/assets/public
cp -rf dist/* android/app/src/main/assets/public/
[ -f capacitor.config.json ] && cp -f capacitor.config.json android/app/src/main/assets/capacitor.config.json

(cd android && chmod +x gradlew && ./gradlew assembleDebug --no-daemon >> /tmp/build_phone.log 2>&1) || { echo "Erro Gradle:"; tail -n 20 /tmp/build_phone.log; exit 1; }

APK="android/app/build/outputs/apk/debug/app-debug.apk"
mkdir -p /home/ubuntu/jarvis_releases dist/public/download
cp -f "$APK" /home/ubuntu/jarvis_releases/jarvis.apk
cp -f "$APK" dist/public/download/jarvis.apk
chmod 644 /home/ubuntu/jarvis_releases/jarvis.apk dist/public/download/jarvis.apk
ls -lh /home/ubuntu/jarvis_releases/jarvis.apk
curl -sI http://127.0.0.1/download/jarvis.apk | grep -iE "HTTP|Content-Length"

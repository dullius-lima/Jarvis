#!/usr/bin/env bash
set -e
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=/home/ubuntu/android-sdk
echo "sdk.dir=/home/ubuntu/android-sdk" > android/local.properties
rm -rf public/download dist/public/download android/app/src/main/assets/public
npm run build:frontend
npx cap sync android
cd android && ./gradlew assembleDebug
mkdir -p /home/ubuntu/jarvis_releases
cp -f app/build/outputs/apk/debug/app-debug.apk /home/ubuntu/jarvis_releases/jarvis.apk
chmod 644 /home/ubuntu/jarvis_releases/jarvis.apk
ls -lh /home/ubuntu/jarvis_releases/jarvis.apk

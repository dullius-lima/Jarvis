#!/usr/bin/env bash
set -e
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which javac))))
export ANDROID_HOME=/home/ubuntu/android-sdk
trap 'rm -rf android/app/src/main/java/com/matheus/jarvis/* && cp -f devices/phone/java/com/matheus/jarvis/* android/app/src/main/java/com/matheus/jarvis/ && cp -f devices/phone/AndroidManifest.xml android/app/src/main/AndroidManifest.xml' EXIT

rm -rf android/app/src/main/java/com/matheus/jarvis/* android/app/src/main/assets/public
cp -f devices/watch/java/com/matheus/jarvis/* android/app/src/main/java/com/matheus/jarvis/
cp -f devices/watch/AndroidManifest.xml android/app/src/main/AndroidManifest.xml
(cd android && ./gradlew assembleDebug)
cp -f android/app/build/outputs/apk/debug/app-debug.apk /home/ubuntu/jarvis_releases/jarvis-watch.apk
chmod 644 /home/ubuntu/jarvis_releases/jarvis-watch.apk
ls -lh /home/ubuntu/jarvis_releases/jarvis-watch.apk
echo "✅ APK do Relógio (jarvis-watch.apk) compilado!"

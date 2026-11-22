#!/usr/bin/env bash
set -e

ROOT_DIR="/home/ubuntu/meu-n8n-backend"
cd "$ROOT_DIR"

export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which javac))))
export ANDROID_HOME=/home/ubuntu/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

echo "☕ JAVA_HOME: $JAVA_HOME"
echo "sdk.dir=/home/ubuntu/android-sdk" > android/local.properties

rm -rf public/download dist/public/download android/app/src/main/assets/public
npm run build:frontend

if [ -x "./node_modules/.bin/cap" ]; then
  ./node_modules/.bin/cap sync android || true
fi

mkdir -p android/app/src/main/assets/public
cp -rf dist/* android/app/src/main/assets/public/

if [ -d "devices/phone/java" ]; then
  mkdir -p android/app/src/main/java
  cp -rf devices/phone/java/* android/app/src/main/java/
fi
if [ -f "devices/phone/AndroidManifest.xml" ]; then
  cp -f devices/phone/AndroidManifest.xml android/app/src/main/AndroidManifest.xml
fi
if [ -d "devices/phone/assets/oww" ]; then
  mkdir -p android/app/src/main/assets/oww
  cp -f devices/phone/assets/oww/* android/app/src/main/assets/oww/
fi

python3 "$ROOT_DIR/fix_phone_manifest.py"

cat << 'PROPS' > android/gradle.properties
org.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8
org.gradle.daemon=false
org.gradle.parallel=false
org.gradle.workers.max=1
android.useAndroidX=true
PROPS

cd "$ROOT_DIR/android"
chmod +x gradlew
rm -f app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleDebug --no-daemon

mkdir -p /home/ubuntu/jarvis_releases
cp -f app/build/outputs/apk/debug/app-debug.apk /home/ubuntu/jarvis_releases/jarvis.apk
chmod 644 /home/ubuntu/jarvis_releases/jarvis.apk
echo "✅ jarvis.apk v3.5.1 compilado com sucesso!"

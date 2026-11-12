#!/bin/bash
set -e

export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which javac))))
export ANDROID_HOME=$HOME/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

echo "☕ Java ativo para compilação:"
java -version

echo "🚀 1. Compilando Frontend Vue..."
npm run build:frontend

echo "🔄 2. Sincronizando com o projeto Android..."
npx cap sync android

echo "📦 3. Compilando o APK com Gradle..."
cd android
chmod +x gradlew
./gradlew assembleDebug

echo "🚚 4. Movendo APK para a rota pública de download..."
cd ..
mkdir -p dist/public/download
cp android/app/build/outputs/apk/debug/app-debug.apk dist/public/download/jarvis.apk

echo "✅ Sucesso! APK compilado e pronto para download:"
echo "👉 https://163.176.111.18/download/jarvis.apk"

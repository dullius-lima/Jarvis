import os, re

PERMS = [
    '<uses-permission android:name="android.permission.READ_CONTACTS" />',
    '<uses-permission android:name="android.permission.WRITE_CONTACTS" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
    '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
    '<uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />',
    '<uses-permission android:name="com.android.alarm.permission.SET_ALARM" />',
]

for path in ["devices/phone/AndroidManifest.xml", "android/app/src/main/AndroidManifest.xml"]:
    if not os.path.exists(path):
        continue
    s = open(path, "r", encoding="utf-8").read()
    missing = [p for p in PERMS if p.split('"')[1] not in s]
    if missing:
        s = re.sub(r'(<manifest\b[^>]*>)', r'\1\n    ' + '\n    '.join(missing), s, count=1)
        open(path, "w", encoding="utf-8").write(s)
        print(f"✅ Permissões injetadas em {path}: {len(missing)} adicionadas")
    else:
        print(f"ℹ️ {path} já possui todas as permissões.")

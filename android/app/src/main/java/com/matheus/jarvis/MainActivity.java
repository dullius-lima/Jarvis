package com.matheus.jarvis;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            startForegroundService(new Intent(this, JarvisVoiceService.class));
        } catch (Throwable ignored) {}
        requestJarvisPermissionsAndSync();
    }

    @Override
    public void onResume() {
        super.onResume();
        DeviceCommandExecutor.startMesh(this, "galaxy_s25");
        DeviceCommandExecutor.triggerSyncNow(this);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        DeviceCommandExecutor.triggerSyncNow(this);
    }

    private void requestJarvisPermissionsAndSync() {
        List<String> req = new ArrayList<>();
        String[] basePerms = {
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.CAMERA,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.WRITE_CONTACTS
        };
        for (String p : basePerms) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) req.add(p);
        }
        String mediaPerm = Build.VERSION.SDK_INT >= 33
            ? Manifest.permission.READ_MEDIA_IMAGES
            : Manifest.permission.READ_EXTERNAL_STORAGE;
        if (checkSelfPermission(mediaPerm) != PackageManager.PERMISSION_GRANTED) req.add(mediaPerm);

        if (!req.isEmpty()) {
            requestPermissions(req.toArray(new String[0]), 9021);
        }
        DeviceCommandExecutor.startMesh(this, "galaxy_s25");
        DeviceCommandExecutor.triggerSyncNow(this);
    }
}

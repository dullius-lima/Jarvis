package com.matheus.jarvis;

import android.Manifest;
import android.app.role.RoleManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebSettings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    public static volatile boolean isAppInForeground = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        if (classExists("com.matheus.jarvis.JarvisDevicePlugin")) {
            try {
                @SuppressWarnings("unchecked")
                Class<? extends com.getcapacitor.Plugin> cls = (Class<? extends com.getcapacitor.Plugin>) Class.forName("com.matheus.jarvis.JarvisDevicePlugin");
                registerPlugin(cls);
            } catch (Exception ignored) {}
        }
        super.onCreate(savedInstanceState);

        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
        }

        requestAllPhonePermissions();
        startPhoneVoiceService();

        new Handler(Looper.getMainLooper()).postDelayed(this::promptAssistantRoleIfNeeded, 1400L);
    }

    private boolean classExists(String name) {
        try { Class.forName(name); return true; } catch (Exception e) { return false; }
    }

    private void requestAllPhonePermissions() {
        String[] perms = new String[]{
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.CAMERA,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.CALL_PHONE,
            Manifest.permission.POST_NOTIFICATIONS
        };
        List<String> missing = new ArrayList<>();
        for (String p : perms) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        }
        if (!missing.isEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toArray(new String[0]), 101);
        }
    }

    private void promptAssistantRoleIfNeeded() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                RoleManager rm = getSystemService(RoleManager.class);
                if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_ASSISTANT) && !rm.isRoleHeld(RoleManager.ROLE_ASSISTANT)) {
                    startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT), 2001);
                }
            }
        } catch (Exception ignored) {}
    }

    private void startPhoneVoiceService() {
        Intent svc = new Intent(this, JarvisVoiceService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(svc);
        else startService(svc);
    }

    @Override public void onResume() { super.onResume(); isAppInForeground = true; }
    @Override public void onPause() { isAppInForeground = false; super.onPause(); }
}

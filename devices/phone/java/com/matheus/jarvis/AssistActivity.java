package com.matheus.jarvis;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

public class AssistActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent svc = new Intent(this, JarvisVoiceService.class);
        svc.setAction("ACTION_WAKE_NOW");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(svc);
        else startService(svc);
        JarvisVoiceService.wakeNow();
        finish();
    }
}

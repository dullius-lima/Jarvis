package com.matheus.jarvis;
import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

public class AssistActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        try {
            Intent si = new Intent(this, JarvisVoiceService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(si);
            else startService(si);
        } catch (Exception ignored) {}
        JarvisVoiceService.wakeNow();
        finish();
    }
}

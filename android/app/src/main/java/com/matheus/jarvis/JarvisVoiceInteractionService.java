package com.matheus.jarvis;
import android.content.Intent;
import android.os.Build;
import android.service.voice.VoiceInteractionService;

public class JarvisVoiceInteractionService extends VoiceInteractionService {
    @Override
    public void onReady() {
        super.onReady();
        try {
            Intent si = new Intent(this, JarvisVoiceService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(si);
            else startService(si);
        } catch (Exception ignored) {}
    }
}

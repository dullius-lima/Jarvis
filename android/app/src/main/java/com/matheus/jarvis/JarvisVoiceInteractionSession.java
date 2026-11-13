package com.matheus.jarvis;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;

public class JarvisVoiceInteractionSession extends VoiceInteractionSession {
    public JarvisVoiceInteractionSession(Context context) { super(context); }

    @Override
    public void onShow(Bundle args, int showFlags) {
        super.onShow(args, showFlags);
        try {
            Intent si = new Intent(getContext(), JarvisVoiceService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(si);
            else getContext().startService(si);
        } catch (Exception ignored) {}
        JarvisVoiceService.wakeNow();
        hide();
    }
}

package com.matheus.jarvis;
import android.content.Intent;
import android.speech.RecognitionService;

public class JarvisRecognitionService extends RecognitionService {
    @Override protected void onStartListening(Intent recognizerIntent, Callback listener) {}
    @Override protected void onCancel(Callback listener) {}
    @Override protected void onStopListening(Callback listener) {}
}

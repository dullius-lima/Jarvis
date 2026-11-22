package com.matheus.jarvis;

import android.Manifest;
import android.animation.ValueAnimator;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.*;
import android.media.*;
import android.media.audiofx.*;
import android.os.*;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.view.*;
import android.view.animation.LinearInterpolator;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.util.*;

public class JarvisVoiceService extends Service {
    private OpenWakeWordDetector owwDetector;
    public static volatile JarvisVoiceService instance;
    private static final String BASE = "http://163.176.111.18";
    private Handler mainHandler;
    private WindowManager wm;
    private EdgeGlowView glowView;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private volatile boolean running = true;
    private volatile boolean isSpeaking = false;
    private volatile long forceAwakeUntil = 0L;
    private volatile long continuousUntil = 0L;

    private volatile boolean prefScreenOff = true;
    private volatile boolean prefOnlyUnlocked = false;
    private volatile boolean prefOnlyAppOpen = false;
    private volatile boolean prefPushToTalk = false;
    private volatile boolean prefSilent = false;
    private volatile boolean prefChime = true;
    private volatile int prefContinuousSec = 15;
    private volatile float prefSensitivity = 1.6f;
    private volatile float prefGain = 3.3f;

    public static void wakeNow() {
        if (instance != null) {
            instance.forceAwakeUntil = System.currentTimeMillis() + 9000L;
            instance.playChime(true);
            instance.showGlow(1);
        }
    }

    private static class EdgeGlowView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private float angle = 0f;
        private int mode = 1;
        private ValueAnimator anim;

        public EdgeGlowView(Context ctx) {
            super(ctx);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(12f);
        }
        public void setMode(int m) { this.mode = m; invalidate(); }

        @Override protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            anim = ValueAnimator.ofFloat(0f, 360f);
            anim.setDuration(1100L);
            anim.setRepeatCount(ValueAnimator.INFINITE);
            anim.setInterpolator(new LinearInterpolator());
            anim.addUpdateListener(a -> { angle = (float) a.getAnimatedValue(); invalidate(); });
            anim.start();
        }
        @Override protected void onDetachedFromWindow() {
            if (anim != null) { anim.cancel(); anim = null; }
            super.onDetachedFromWindow();
        }
        @Override protected void onDraw(Canvas canvas) {
            int w = getWidth(), h = getHeight();
            if (w <= 0 || h <= 0) return;
            int[] c = mode == 1 ? new int[]{0xFFEF4444, 0xFFF87171, 0xFFDC2626, 0xFFEF4444}
                    : mode == 2 ? new int[]{0xFF38BDF8, 0xFF818CF8, 0xFF22D3EE, 0xFF38BDF8}
                    : new int[]{0xFF22D3EE, 0xFF34D399, 0xFF38BDF8, 0xFF22D3EE};
            SweepGradient sg = new SweepGradient(w / 2f, h / 2f, c, null);
            Matrix m = new Matrix();
            m.setRotate(angle, w / 2f, h / 2f);
            sg.setLocalMatrix(m);
            paint.setShader(sg);
            canvas.drawRect(5f, 5f, w - 5f, h - 5f, paint);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        owwDetector = new OpenWakeWordDetector(this);
        DeviceCommandExecutor.startMesh(this, "galaxy_s25");
        instance = this;
        mainHandler = new Handler(Looper.getMainLooper());
        tts = new TextToSpeech(getApplicationContext(), st -> {
            if (st == TextToSpeech.SUCCESS) {
                int r = tts.setLanguage(new Locale("pt", "BR"));
                ttsReady = (r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED);
            }
        });

        NotificationChannel ch = new NotificationChannel("jarvis_24h", "JARVIS Escuta Ativa 24h", NotificationManager.IMPORTANCE_LOW);
        getSystemService(NotificationManager.class).createNotificationChannel(ch);
        Notification n = new NotificationCompat.Builder(this, "jarvis_24h")
                .setContentTitle("JARVIS Escuta Ativa 24h")
                .setContentText("Ouvindo 'Jarvis' em segundo plano")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setOngoing(true)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(101, n, (Build.VERSION.SDK_INT >= 34 ? (ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE | ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA) : ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE));
        else startForeground(101, n);

        try { PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE); PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "jarvis:voice24h"); wl.acquire(); } catch (Exception ignored) {}
        new Thread(this::prefsLoop, "JarvisPrefs").start();
        new Thread(this::listenLoop, "JarvisPhoneAudio").start();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "ACTION_WAKE_NOW".equals(intent.getAction())) wakeNow();
        return START_STICKY;
    }

    
    private void updateNotifStatus(String msg) {
        try {
            Notification n = new NotificationCompat.Builder(this, "jarvis_24h")
                    .setContentTitle("JARVIS Escuta Ativa 24h")
                    .setContentText(msg)
                    .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                    .setOnlyAlertOnce(true)
                    .setOngoing(true)
                    .build();
            getSystemService(NotificationManager.class).notify(101, n);
        } catch (Exception ignored) {}
    }

    private void prefsLoop() {
        while (running) {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/api/v1/preferences").openConnection();
                c.setConnectTimeout(2500);
                c.setReadTimeout(2500);
                Scanner sc = new Scanner(c.getInputStream()).useDelimiter("\\A");
                JSONObject j = new JSONObject(sc.hasNext() ? sc.next() : "{}");
                JSONObject d = j.optJSONObject("data") != null ? j.getJSONObject("data") : j;
                prefScreenOff = d.optBoolean("listen_screen_off", true);
                prefOnlyUnlocked = d.optBoolean("listen_only_unlocked", false);
                prefOnlyAppOpen = d.optBoolean("listen_only_app_open", false);
                prefPushToTalk = d.optBoolean("push_to_talk_only", false);
                prefSilent = d.optBoolean("silent_text_only", false);
                prefChime = d.optBoolean("chime_enabled", true);
                prefContinuousSec = d.optInt("continuous_chat_seconds", 15);
                prefSensitivity = (float) Math.max(0.5, Math.min(2.5, d.optDouble("mic_sensitivity", 1.6)));
                prefGain = (float) Math.max(1.8, Math.min(4.8, prefSensitivity * 2.1));
            } catch (Exception ignored) {}
            try { Thread.sleep(1500L); } catch (InterruptedException ignored) {}
        }
    }

    private boolean canListenNow() {
        if (isSpeaking) return false;
        // Escuta ativa tambem com app aberto // Libera mic para o WebView dentro do app
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return false;
        if (System.currentTimeMillis() < forceAwakeUntil || System.currentTimeMillis() < continuousUntil) return true;
        if (prefOnlyAppOpen || prefPushToTalk) return false;

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        boolean screenOn = pm == null || pm.isInteractive();
        boolean locked = km != null && km.isKeyguardLocked();
        if (!screenOn && !prefScreenOff) return false;
        if (locked && prefOnlyUnlocked) return false;
        return true;
    }

    private void listenLoop() {
        int sr = 16000;
        int minBuf = AudioRecord.getMinBufferSize(sr, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int bufSize = Math.max(minBuf * 2, 8192);
        AudioRecord rec = null;
        double noiseFloor = 110.0;
        double hpPrevIn = 0.0, hpPrevOut = 0.0, lpPrevOut = 0.0;
        ArrayDeque<byte[]> preRoll = new ArrayDeque<>();

        while (running) {
            if (!canListenNow()) {
                if (rec != null) { try { rec.stop(); rec.release(); } catch (Exception ignored) {} rec = null; }
                hideGlow();
                try { Thread.sleep(250L); } catch (InterruptedException ignored) {}
                continue;
            }

            try {
                if (rec == null) {
                    rec = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, sr,
                            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufSize);
                    if (rec.getState() != AudioRecord.STATE_INITIALIZED) { rec.release(); rec = null; Thread.sleep(400L); continue; }
                    try {
                        if (AutomaticGainControl.isAvailable()) AutomaticGainControl.create(rec.getAudioSessionId()).setEnabled(true);
                        if (NoiseSuppressor.isAvailable()) NoiseSuppressor.create(rec.getAudioSessionId()).setEnabled(true);
                        if (AcousticEchoCanceler.isAvailable()) AcousticEchoCanceler.create(rec.getAudioSessionId()).setEnabled(true);
                    } catch (Exception ignored) {}
                    rec.startRecording();
                }

                short[] chunk = new short[1600]; // 100ms
                int n = rec.read(chunk, 0, chunk.length);
                if (n <= 0) continue;

                long sumSq = 0;
                byte[] pcmBytes = new byte[n * 2];
                for (int i = 0; i < n; i++) {
                    double x = chunk[i];
                    double hp = 0.89 * (hpPrevOut + x - hpPrevIn);
                    hpPrevIn = x; hpPrevOut = hp;
                    double lp = lpPrevOut + 0.57 * (hp - lpPrevOut);
                    lpPrevOut = lp;
                    int amp = Math.max(-32768, Math.min(32767, (int) (lp * prefGain)));
                    sumSq += (long) amp * amp;
                    pcmBytes[i * 2] = (byte) (amp & 0xFF);
                    pcmBytes[i * 2 + 1] = (byte) ((amp >> 8) & 0xFF);
                }

                double rms = Math.sqrt((double) sumSq / n);
                double baseThresh = Math.max(115.0, 340.0 / Math.max(0.5, prefSensitivity));
                double threshold = Math.max(baseThresh, Math.min(noiseFloor, 180.0) * 1.35);
                boolean forced = System.currentTimeMillis() < forceAwakeUntil || System.currentTimeMillis() < continuousUntil;

                if (!forced && rms < threshold) {
                    noiseFloor = noiseFloor * 0.94 + rms * 0.06;
                    preRoll.addLast(pcmBytes);
                    while (preRoll.size() > 12) preRoll.removeFirst(); // 1.2s pré-buffer
                    continue;
                }

                // Captura fala completa até pausa de 900ms
                ByteArrayOutputStream utterance = new ByteArrayOutputStream();
                for (byte[] b : preRoll) utterance.write(b);
                preRoll.clear();
                utterance.write(pcmBytes);

                if (forced) showGlow(1);
                long startSpeak = System.currentTimeMillis();
                long lastVoice = startSpeak;

                while (running && canListenNow() && (System.currentTimeMillis() - startSpeak < 8500L)) {
                    int r = rec.read(chunk, 0, chunk.length);
                    if (r <= 0) continue;
                    long s2 = 0;
                    byte[] b2 = new byte[r * 2];
                    for (int i = 0; i < r; i++) {
                        int a = Math.max(-32768, Math.min(32767, (int) (chunk[i] * prefGain)));
                        s2 += (long) a * a;
                        b2[i * 2] = (byte) (a & 0xFF);
                        b2[i * 2 + 1] = (byte) ((a >> 8) & 0xFF);
                    }
                    utterance.write(b2);
                    double curRms = Math.sqrt((double) s2 / r);
                    if (curRms >= threshold * 0.85) lastVoice = System.currentTimeMillis();
                    else if (System.currentTimeMillis() - lastVoice > 900L && utterance.size() > 12800) break;
                }

                byte[] fullPcm = utterance.toByteArray();
                if (fullPcm.length < 11000) { hideGlow(); continue; }

                if (forced) showGlow(2);
                sendAudioTurn(fullPcm, sr, !forced);
            } catch (Exception e) {
                if (rec != null) { try { rec.stop(); rec.release(); } catch (Exception ignored) {} rec = null; }
                try { Thread.sleep(400L); } catch (InterruptedException ignored) {}
            }
        }
    }

    private void sendAudioTurn(byte[] pcm, int sr, boolean requireWake) {
        try {
            updateNotifStatus("📤 Enviando fala para VM...");
            byte[] wav = buildWav(pcm, sr);
            JSONObject body = new JSONObject();
            body.put("audioBase64", Base64.encodeToString(wav, Base64.NO_WRAP));
            body.put("mimeType", "audio/wav");
            body.put("requireWakeWord", requireWake);
            body.put("identityToken", "Matheus-Admin");
            body.put("sessionId", "sess_main_admin");
                body.put("deviceId", "galaxy_s25");

            HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/api/v1/voice/turn").openConnection();
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/json");
            c.setConnectTimeout(5000);
            c.setReadTimeout(22000);
            c.setDoOutput(true);
            c.getOutputStream().write(body.toString().getBytes("UTF-8"));

            Scanner sc = new Scanner(c.getInputStream()).useDelimiter("\\A");
            JSONObject res = new JSONObject(sc.hasNext() ? sc.next() : "{}");
            boolean woke = res.optBoolean("woke", !requireWake);
            String reply = res.optString("reply", "");
            String transcript = res.optString("transcript", "");
            String audioB64 = res.optString("audioBase64", "");

            updateNotifStatus(transcript.isEmpty() ? "🎙️ Ouvindo 'Jarvis'..." : "👂 Ouviu: " + transcript);
            if (!woke && reply.isEmpty()) { hideGlow(); return; }
            forceAwakeUntil = 0L;

            if (transcript.toLowerCase().matches(".*(obrigado|pode descansar|encerrar|tchau).*")) {
                continuousUntil = 0L;
            } else if (prefContinuousSec > 0) {
                continuousUntil = System.currentTimeMillis() + (prefContinuousSec * 1000L);
            }

            if (reply.isEmpty() && woke) {
                playChime(true);
                showGlow(1);
                return;
            }

            playReply(reply, audioB64);
        } catch (Exception e) {
            updateNotifStatus("❌ Erro conexão VM: " + e.getClass().getSimpleName());
            hideGlow();
        }
    }

    private void playReply(String text, String audioB64) {
        String clean = (text == null ? "" : text).replaceAll("[*#_`~>|]", "").trim();
        if (prefSilent || (clean.isEmpty() && (audioB64 == null || audioB64.isEmpty()))) {
            if (System.currentTimeMillis() < continuousUntil) showGlow(1); else hideGlow();
            return;
        }
        isSpeaking = true;
        showGlow(3);
        mainHandler.post(() -> {
            Runnable onDone = () -> {
                isSpeaking = false;
                if (System.currentTimeMillis() < continuousUntil) showGlow(1);
                else hideGlow();
            };
            if (audioB64 != null && !audioB64.isEmpty()) {
                try {
                    File f = File.createTempFile("jv_ph_", ".mp3", getCacheDir());
                    try (FileOutputStream fos = new FileOutputStream(f)) { fos.write(Base64.decode(audioB64, Base64.DEFAULT)); }
                    MediaPlayer mp = new MediaPlayer();
                    mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
                    mp.setDataSource(f.getAbsolutePath());
                    mp.setOnCompletionListener(m -> { m.release(); f.delete(); onDone.run(); });
                    mp.setOnErrorListener((m, w, e) -> { m.release(); f.delete(); onDone.run(); return true; });
                    mp.prepare();
                    mp.start();
                    mainHandler.postDelayed(() -> { if (isSpeaking) onDone.run(); }, 25000L);
                    return;
                } catch (Exception ignored) {}
            }
            if (tts != null && ttsReady && !clean.isEmpty()) tts.speak(clean, TextToSpeech.QUEUE_FLUSH, null, "ph_ans");
            mainHandler.postDelayed(onDone, Math.max(2200L, clean.length() * 65L));
        });
    }

    private void playChime(boolean up) {
        if (!prefChime) return;
        new Thread(() -> {
            try {
                int sr = 16000, len = (int) (sr * 0.13);
                short[] pcm = new short[len];
                double f1 = up ? 587.33 : 783.99, f2 = up ? 880.0 : 587.33;
                for (int i = 0; i < len; i++) {
                    double f = i < len / 2 ? f1 : f2;
                    double env = Math.min(1.0, i / 50.0) * (1.0 - (double) i / len);
                    pcm[i] = (short) (Math.sin(2.0 * Math.PI * f * i / sr) * 14000 * env);
                }
                AudioTrack t = new AudioTrack.Builder()
                        .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                        .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(sr).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                        .setBufferSizeInBytes(pcm.length * 2).setTransferMode(AudioTrack.MODE_STATIC).build();
                t.write(pcm, 0, pcm.length);
                t.play();
                Thread.sleep(150);
                t.release();
            } catch (Exception ignored) {}
        }).start();
    }

    private void showGlow(int mode) {
        mainHandler.post(() -> {
            try {
                if (!Settings.canDrawOverlays(this)) return;
                if (wm == null) wm = (WindowManager) getSystemService(WINDOW_SERVICE);
                if (glowView == null) {
                    glowView = new EdgeGlowView(this);
                    int flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN;
                    wm.addView(glowView, new WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, flags, PixelFormat.TRANSLUCENT));
                }
                glowView.setMode(mode);
                glowView.setVisibility(View.VISIBLE);
            } catch (Exception ignored) {}
        });
    }

    private void hideGlow() {
        mainHandler.post(() -> { if (glowView != null) glowView.setVisibility(View.GONE); });
    }

    private byte[] buildWav(byte[] pcm, int sr) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int totalDataLen = pcm.length + 36, byteRate = sr * 2;
        out.write("RIFF".getBytes());
        out.write(new byte[]{(byte)(totalDataLen & 0xff), (byte)((totalDataLen >> 8) & 0xff), (byte)((totalDataLen >> 16) & 0xff), (byte)((totalDataLen >> 24) & 0xff)});
        out.write("WAVEfmt ".getBytes());
        out.write(new byte[]{16, 0, 0, 0, 1, 0, 1, 0});
        out.write(new byte[]{(byte)(sr & 0xff), (byte)((sr >> 8) & 0xff), (byte)((sr >> 16) & 0xff), (byte)((sr >> 24) & 0xff)});
        out.write(new byte[]{(byte)(byteRate & 0xff), (byte)((byteRate >> 8) & 0xff), (byte)((byteRate >> 16) & 0xff), (byte)((byteRate >> 24) & 0xff)});
        out.write(new byte[]{2, 0, 16, 0});
        out.write("data".getBytes());
        out.write(new byte[]{(byte)(pcm.length & 0xff), (byte)((pcm.length >> 8) & 0xff), (byte)((pcm.length >> 16) & 0xff), (byte)((pcm.length >> 24) & 0xff)});
        out.write(pcm);
        return out.toByteArray();
    }

    @Override public void onDestroy() { running = false; hideGlow(); if (tts != null) tts.shutdown(); super.onDestroy(); }
    @Override public IBinder onBind(Intent i) { return null; }
}

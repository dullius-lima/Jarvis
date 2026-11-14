package com.matheus.jarvis;








import java.util.Scanner;
import java.net.URL;
import java.net.HttpURLConnection;
import android.os.PowerManager;
import android.content.SharedPreferences;
import android.content.Context;
import android.app.KeyguardManager;
import android.Manifest;
import android.animation.ValueAnimator;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.*;
import android.media.*;
import android.os.*;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.view.*;
import android.view.animation.LinearInterpolator;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;
import java.io.*;
import java.lang.reflect.Method;
import java.net.*;
import java.text.Normalizer;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;

public class JarvisVoiceService extends Service {

    // --- GUARDA DE ENERGIA, TELA LIGADA E DESBLOQUEIO ---
    private android.os.PowerManager guardPowerManager;
    private android.app.KeyguardManager guardKeyguardManager;
    private volatile boolean guardListenScreenOff = false;
    private volatile boolean guardListenOnlyUnlocked = true;
    private volatile boolean guardListenOnlyAppOpen = false;
    private volatile boolean guardPushToTalkOnly = false;
    private volatile long guardLastSyncMs = 0L;
    private volatile boolean guardSyncInFlight = false;

    private void initScreenAndPrefsGuard() {
        try {
            guardPowerManager = (android.os.PowerManager) getSystemService(android.content.Context.POWER_SERVICE);
            guardKeyguardManager = (android.app.KeyguardManager) getSystemService(android.content.Context.KEYGUARD_SERVICE);
            android.content.SharedPreferences sp = getSharedPreferences("jarvis_user_prefs_cache", MODE_PRIVATE);
            guardListenScreenOff = sp.getBoolean("listen_screen_off", false);
            guardListenOnlyUnlocked = sp.getBoolean("listen_only_unlocked", true);
            guardListenOnlyAppOpen = sp.getBoolean("listen_only_app_open", false);
            guardPushToTalkOnly = sp.getBoolean("push_to_talk_only", false);
        } catch (Exception ignored) {}
    }

    private void syncPrefsFromServerAsync() {
        long now = System.currentTimeMillis();
        if (guardSyncInFlight || (now - guardLastSyncMs) < 3000L) return;
        guardLastSyncMs = now;
        guardSyncInFlight = true;
        new Thread(() -> {
            try {
                String[] urls = new String[]{
                    "https://163.176.111.18/api/v1/preferences",
                    "http://163.176.111.18/api/v1/preferences"
                };
                for (String u : urls) {
                    try {
                        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(u).openConnection();
                        c.setConnectTimeout(2500);
                        c.setReadTimeout(2500);
                        if (c.getResponseCode() == 200) {
                            java.util.Scanner sc = new java.util.Scanner(c.getInputStream(), "UTF-8").useDelimiter("\\A");
                            org.json.JSONObject j = new org.json.JSONObject(sc.hasNext() ? sc.next() : "{}");
                            org.json.JSONObject d = j.optJSONObject("data");
                            if (d != null) {
                                boolean screenOff = d.optBoolean("listen_screen_off", false);
                                boolean unlockedOnly = d.optBoolean("listen_only_unlocked", false);
                                boolean appOpenOnly = d.optBoolean("listen_only_app_open", false);
                                boolean pttOnly = d.optBoolean("push_to_talk_only", false);

                                guardListenScreenOff = screenOff;
                                guardListenOnlyUnlocked = unlockedOnly;
                                guardListenOnlyAppOpen = appOpenOnly;
                                guardPushToTalkOnly = pttOnly;

                                getSharedPreferences("jarvis_user_prefs_cache", MODE_PRIVATE).edit()
                                    .putBoolean("listen_screen_off", screenOff)
                                    .putBoolean("listen_only_unlocked", unlockedOnly)
                                    .putBoolean("listen_only_app_open", appOpenOnly)
                                    .putBoolean("push_to_talk_only", pttOnly)
                                    .apply();
                            }
                            break;
                        }
                    } catch (Exception ignored) {}
                }
            } finally {
                guardSyncInFlight = false;
            }
        }).start();
    }

    private boolean shouldCaptureAudioNow() {
        syncPrefsFromServerAsync();
        if (guardPushToTalkOnly) return false;
        if (guardListenOnlyAppOpen && !MainActivity.isAppInForeground) return false;

        boolean screenInteractive = (guardPowerManager == null) || guardPowerManager.isInteractive();
        boolean deviceUnlocked = (guardKeyguardManager == null) || !guardKeyguardManager.isKeyguardLocked();

        // Se "Manter áudio com tela desligada" estiver DESMARCADO, exige tela acesa E celular desbloqueado
        // (evita disparos no bolso quando chega notificação na tela de bloqueio)
        if (!guardListenScreenOff || guardListenOnlyUnlocked) {
            return screenInteractive && deviceUnlocked;
        }
        return true;
    }


    public static volatile JarvisVoiceService instance;

    public static void wakeNow() {
        if (instance != null) {
            instance.awakeUntil = System.currentTimeMillis() + 10000L;
            instance.wakeScreenOnce();
            instance.playChime(true);
            instance.showScreenGlow(1);
        }
    }

    private static final String BASE = "http://163.176.111.18";
    private static final int SAMPLE_RATE = 16000;
    private Handler mainHandler;
    private PowerManager.WakeLock wakeLock;
    private PowerManager powerManager;
    private KeyguardManager keyguardManager;
    private volatile boolean prefListenScreenOff = true;
    private volatile boolean prefListenOnlyUnlocked = false;
    private volatile boolean prefListenOnlyAppOpen = false;
    private volatile boolean prefPushToTalkOnly = false;
    private volatile boolean prefSilentTextOnly = false;
    private volatile boolean prefChimeEnabled = true;
    private volatile boolean prefPrivacyLockCamera = false;
    private volatile int prefContinuousSec = 0;
    private volatile double prefSensMultiplier = 1.65;
    private volatile String prefWhisperModel = "small";
    private volatile long lastPrefSyncMs = 0L;

    private void syncUserPrefsIfNeeded() {
        long now = System.currentTimeMillis();
        if (now - lastPrefSyncMs < 5000L) return;
        lastPrefSyncMs = now;
        netPool.execute(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/api/v1/preferences").openConnection();
                c.setConnectTimeout(2500);
                c.setReadTimeout(2500);
                Scanner sc = new Scanner(c.getInputStream()).useDelimiter("\\A");
                JSONObject j = new JSONObject(sc.hasNext() ? sc.next() : "{}");
                JSONObject d = j.optJSONObject("data");
                if (d != null) {
                    prefListenScreenOff = d.optBoolean("listen_screen_off", true);
                    prefListenOnlyUnlocked = d.optBoolean("listen_only_unlocked", false);
                    prefListenOnlyAppOpen = d.optBoolean("listen_only_app_open", false);
                    prefPushToTalkOnly = d.optBoolean("push_to_talk_only", false);
                    prefSilentTextOnly = d.optBoolean("silent_text_only", false);
                    prefChimeEnabled = d.optBoolean("chime_enabled", true);
                    prefPrivacyLockCamera = d.optBoolean("privacy_lock_camera", false);
                    prefContinuousSec = d.optInt("continuous_chat_seconds", 0);
                    prefWhisperModel = d.optString("whisper_model", "small");
                    String sens = d.optString("mic_sensitivity", "balanced");
                    prefSensMultiplier = "high".equals(sens) ? 1.35 : ("noisy".equals(sens) ? 2.25 : 1.65);
                }
            } catch (Exception ignored) {}
        });
    }
    private AudioManager audioManager;
    private TextToSpeech nativeTts;
    private volatile boolean ttsReady = false;
    private volatile boolean running = true;
    private volatile boolean isSpeaking = false;
    private volatile boolean isProcessing = false;
    private volatile long awakeUntil = 0L;
    private volatile long lastScreenWakeAt = 0L;
    private volatile long lastWakeChimeAt = 0L;
    private JarvisEdgeGlowView edgeGlowView;
    private WindowManager wm;
    private final ExecutorService netPool = Executors.newSingleThreadExecutor();

    private static class JarvisEdgeGlowView extends View {
        private final Paint outerGlowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint innerRimPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Matrix shaderMatrix = new Matrix();
        private float angle = 0f;
        private float pulseScale = 1f;
        private int glowMode = 1; // 1 = Ouvindo (VERMELHO), 2 = Processando (AZUL), 3 = Falando (CIANO)
        private ValueAnimator animator;

        public JarvisEdgeGlowView(Context ctx) {
            super(ctx);
            outerGlowPaint.setStyle(Paint.Style.STROKE);
            outerGlowPaint.setMaskFilter(new BlurMaskFilter(30f, BlurMaskFilter.Blur.NORMAL));
            innerRimPaint.setStyle(Paint.Style.STROKE);
        }

        public void setGlowMode(int mode) {
            this.glowMode = mode;
            if (animator != null) {
                animator.setDuration(mode == 2 ? 950L : (mode == 3 ? 850L : 1450L));
            }
            invalidate();
        }

        @Override
        protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            animator = ValueAnimator.ofFloat(0f, 360f);
            animator.setDuration(1450L);
            animator.setRepeatCount(ValueAnimator.INFINITE);
            animator.setInterpolator(new LinearInterpolator());
            animator.addUpdateListener(anim -> {
                angle = (float) anim.getAnimatedValue();
                double rad = Math.toRadians(angle * (glowMode == 3 ? 3.0 : 2.0));
                pulseScale = 1f + (float) Math.sin(rad) * (glowMode == 3 ? 0.28f : 0.20f);
                invalidate();
            });
            animator.start();
        }

        @Override
        protected void onDetachedFromWindow() {
            if (animator != null) {
                animator.cancel();
                animator = null;
            }
            super.onDetachedFromWindow();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            int w = getWidth();
            int h = getHeight();
            if (w <= 0 || h <= 0) return;

            int[] colors;
            if (glowMode == 1) {
                colors = new int[]{0xFFEF4444, 0xFFDC2626, 0xFFF87171, 0xFFB91C1C, 0xFFEF4444};
            } else if (glowMode == 2) {
                colors = new int[]{0xFF38BDF8, 0xFF818CF8, 0xFF22D3EE, 0xFF6366F1, 0xFF38BDF8};
            } else {
                colors = new int[]{0xFF22D3EE, 0xFF34D399, 0xFF38BDF8, 0xFF60A5FA, 0xFF22D3EE};
            }

            SweepGradient gradient = new SweepGradient(w / 2f, h / 2f, colors, null);
            shaderMatrix.setRotate(angle, w / 2f, h / 2f);
            gradient.setLocalMatrix(shaderMatrix);

            outerGlowPaint.setShader(gradient);
            outerGlowPaint.setStrokeWidth(34f * pulseScale);
            outerGlowPaint.setAlpha(155);
            canvas.drawRoundRect(0f, 0f, w, h, 58f, 58f, outerGlowPaint);

            innerRimPaint.setShader(gradient);
            innerRimPaint.setStrokeWidth(9f * pulseScale);
            innerRimPaint.setAlpha(245);
            canvas.drawRoundRect(2f, 2f, w - 2f, h - 2f, 56f, 56f, innerRimPaint);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        initScreenAndPrefsGuard();
        instance = this;
        mainHandler = new Handler(Looper.getMainLooper());
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        nativeTts = new TextToSpeech(getApplicationContext(), status -> {
            if (status == TextToSpeech.SUCCESS) {
                int res = nativeTts.setLanguage(new Locale("pt", "BR"));
                ttsReady = (res != TextToSpeech.LANG_MISSING_DATA && res != TextToSpeech.LANG_NOT_SUPPORTED);
                nativeTts.setSpeechRate(1.06f);
            }
        });

        NotificationChannel ch = new NotificationChannel("jarvis_bg", "JARVIS Assistente 24h", NotificationManager.IMPORTANCE_LOW);
        getSystemService(NotificationManager.class).createNotificationChannel(ch);

        Notification notif = new NotificationCompat.Builder(this, "jarvis_bg")
                .setContentTitle("JARVIS Sempre Ativo (Zero Bipes)")
                .setContentText("Escuta contínua calibrada — diga 'Jarvis'")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setOngoing(true)
                .build();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(101, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else {
                startForeground(101, notif);
            }
        } catch (Exception e) {
            stopSelf();
            return;
        }

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        this.powerManager = pm;
        this.keyguardManager = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "jarvis:always_on_clean");
        wakeLock.acquire();

        new Thread(this::continuousAudioLoop, "JarvisAlwaysOnAudio").start();
    }

    private void wakeScreenOnce() {
        long now = System.currentTimeMillis();
        if (now - lastScreenWakeAt < 8000L) return;
        lastScreenWakeAt = now;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) {
                @SuppressWarnings("deprecation")
                PowerManager.WakeLock screenLock = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                        "jarvis:screen_wake");
                screenLock.acquire(5000L);
            }
        } catch (Exception ignored) {}
    }

    private void showScreenGlow(int mode) {
        mainHandler.post(() -> {
            try {
                if (MainActivity.isAppInForeground || !Settings.canDrawOverlays(this)) return;
                if (wm == null) wm = (WindowManager) getSystemService(WINDOW_SERVICE);
                if (edgeGlowView == null) {
                    edgeGlowView = new JarvisEdgeGlowView(this);
                    int flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                            | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
                    WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                            WindowManager.LayoutParams.MATCH_PARENT,
                            WindowManager.LayoutParams.MATCH_PARENT,
                            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                            flags,
                            PixelFormat.TRANSLUCENT);
                    lp.gravity = Gravity.TOP | Gravity.START;
                    wm.addView(edgeGlowView, lp);
                }
                edgeGlowView.setGlowMode(mode);
                edgeGlowView.setVisibility(View.VISIBLE);
            } catch (Exception ignored) {}
        });
    }

    private void hideScreenGlow() {
        mainHandler.post(() -> {
            if (edgeGlowView != null) edgeGlowView.setVisibility(View.GONE);
        });
    }

    private void playChime(boolean wake) {
        if (!prefChimeEnabled) return;
        if (wake) {
            long t = System.currentTimeMillis();
            if (t - lastWakeChimeAt < 2000L) return;
            lastWakeChimeAt = t;
        }
        new Thread(() -> {
            try {
                int sr = 16000;
                int samples = (int) (sr * 0.14);
                short[] pcm = new short[samples];
                double f1 = wake ? 587.33 : 783.99;
                double f2 = wake ? 880.00 : 587.33;
                for (int i = 0; i < samples; i++) {
                    double freq = (i < samples / 2) ? f1 : f2;
                    double env = Math.min(1.0, i / 80.0) * (1.0 - (double) i / samples);
                    pcm[i] = (short) (Math.sin(2.0 * Math.PI * freq * i / sr) * 14000 * env);
                }
                AudioTrack track = new AudioTrack.Builder()
                        .setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_MEDIA)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build())
                        .setAudioFormat(new AudioFormat.Builder()
                                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                                .setSampleRate(sr)
                                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                                .build())
                        .setBufferSizeInBytes(pcm.length * 2)
                        .setTransferMode(AudioTrack.MODE_STATIC)
                        .build();
                track.write(pcm, 0, pcm.length);
                track.play();
                Thread.sleep(160);
                track.release();
            } catch (Exception ignored) {}
        }).start();
    }

    // AudioRecord permanece 100% ligado em segundo plano: ZERO bipes de liga/desliga e zero lacunas!
    private void continuousAudioLoop() {
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO);
        int minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int chunkSize = Math.max(minBuf / 2, 1600); // ~50ms
        byte[] buf = new byte[chunkSize];
        LinkedList<byte[]> preRoll = new LinkedList<>();
        ByteArrayOutputStream speechBuf = new ByteArrayOutputStream();
        boolean capturing = false;
        int voicedChunks = 0;
        long lastVoiceMs = 0L;
        long captureStartMs = 0L;
        double noiseFloor = 150.0;
        AudioRecord recorder = null;

        while (running) {

                    if (!shouldCaptureAudioNow()) {
                        
                        if (recorder != null && recorder.getRecordingState() == android.media.AudioRecord.RECORDSTATE_RECORDING) {
                            try { recorder.stop(); } catch (Exception ignored) {}
                        }
                        try { Thread.sleep(350); } catch (Exception ignored) {}
                        continue;
                    } else if (recorder != null && recorder.getRecordingState() != android.media.AudioRecord.RECORDSTATE_RECORDING) {
                        try { recorder.startRecording(); } catch (Exception ignored) {}
                    }


            try {
                syncUserPrefsIfNeeded();
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
                        || MainActivity.isAppInForeground
                        || isSpeaking
                        || isProcessing) {
                    if (recorder != null) {
                        try { recorder.stop(); recorder.release(); } catch (Exception ignored) {}
                        recorder = null;
                    }
                    if (MainActivity.isAppInForeground) {
                        awakeUntil = 0L;
                        hideScreenGlow();
                    }
                    capturing = false;
                    voicedChunks = 0;
                    speechBuf.reset();
                    preRoll.clear();
                    Thread.sleep(200);
                    continue;
                }

                long now = System.currentTimeMillis();
                if (awakeUntil > 0L && now >= awakeUntil && !capturing) {
                    awakeUntil = 0L;
                    hideScreenGlow();
                }

                if (recorder == null) {
                    recorder = new AudioRecord(MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
                            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, chunkSize * 6);
                    if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
                        recorder.release();
                        recorder = null;
                        Thread.sleep(800);
                        continue;
                    }
                    recorder.startRecording();
                }

                int read = recorder.read(buf, 0, buf.length);
                if (read <= 0) continue;

                long sum = 0;
                for (int i = 0; i + 1 < read; i += 2) {
                    short s = (short) ((buf[i] & 0xff) | (buf[i + 1] << 8));
                    int boosted = (int) (s * 2.3);
                    if (boosted > 32767) boosted = 32767;
                    if (boosted < -32767) boosted = -32767;
                    buf[i] = (byte) (boosted & 0xff);
                    buf[i + 1] = (byte) ((boosted >> 8) & 0xff);
                    sum += (long) boosted * boosted;
                }
                double rms = Math.sqrt((double) sum / (read / 2.0));
                double threshold = Math.max(620.0, Math.min(noiseFloor * 2.5, 1150.0));

                if (!capturing) {
                    if (rms < threshold) {
                        noiseFloor = noiseFloor * 0.95 + Math.min(rms, 300.0) * 0.05;
                        voicedChunks = 0;
                    } else {
                        voicedChunks++;
                    }
                    byte[] copy = Arrays.copyOf(buf, read);
                    preRoll.addLast(copy);
                    if (preRoll.size() > 20) preRoll.removeFirst(); // 1.0s pré-fala (nunca corta o início de "Jarvis")

                    if (voicedChunks >= 4) { // ~200ms de voz sustentada
                        capturing = true;
                        voicedChunks = 0;
                        captureStartMs = now;
                        lastVoiceMs = now;
                        speechBuf.reset();
                        for (byte[] p : preRoll) speechBuf.write(p);
                        preRoll.clear();
                    }
                } else {
                    speechBuf.write(buf, 0, read);
                    if (rms > threshold * 0.78) lastVoiceMs = now;

                    // Fecha rápido (550ms de pausa ou 5.5s máx) para resposta ágil
                    if (now - lastVoiceMs > 550L || now - captureStartMs > 6000L) {
                        capturing = false;
                        byte[] pcm = speechBuf.toByteArray();
                        speechBuf.reset();
                        if (pcm.length >= 9600) {
                            byte[] wav = wrapWav(normalizeAndPad(pcm, SAMPLE_RATE), SAMPLE_RATE);
                            netPool.execute(() -> processVoiceClip(wav));
                        }
                    }
                }
            } catch (Exception e) {
                try { Thread.sleep(300); } catch (Exception ignored) {}
            }
        }
    }

    private byte[] normalizeAndPad(byte[] pcm, int rate) {
        int maxAbs = 0;
        for (int i = 0; i + 1 < pcm.length; i += 2) {
            int s = Math.abs((short) ((pcm[i] & 0xff) | (pcm[i + 1] << 8)));
            if (s > maxAbs) maxAbs = s;
        }
        double gain = (maxAbs > 1400 && maxAbs < 25000) ? Math.min(1.6, 22000.0 / maxAbs) : 1.0;
        int padBytes = (rate * 2 * 350) / 1000;
        byte[] out = new byte[pcm.length + padBytes];
        for (int i = 0; i + 1 < pcm.length; i += 2) {
            short s = (short) ((pcm[i] & 0xff) | (pcm[i + 1] << 8));
            int boosted = (int) Math.round(s * gain);
            if (boosted > 32767) boosted = 32767;
            if (boosted < -32767) boosted = -32767;
            out[i] = (byte) (boosted & 0xff);
            out[i + 1] = (byte) ((boosted >> 8) & 0xff);
        }
        return out;
    }

    private byte[] wrapWav(byte[] pcm, int rate) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(44 + pcm.length);
        int totalDataLen = pcm.length + 36;
        int byteRate = rate * 2;
        out.write(new byte[]{'R','I','F','F'});
        out.write(new byte[]{(byte)(totalDataLen & 0xff),(byte)((totalDataLen>>8)&0xff),(byte)((totalDataLen>>16)&0xff),(byte)((totalDataLen>>24)&0xff)});
        out.write(new byte[]{'W','A','V','E','f','m','t',' ',16,0,0,0,1,0,1,0});
        out.write(new byte[]{(byte)(rate & 0xff),(byte)((rate>>8)&0xff),(byte)((rate>>16)&0xff),(byte)((rate>>24)&0xff)});
        out.write(new byte[]{(byte)(byteRate & 0xff),(byte)((byteRate>>8)&0xff),(byte)((byteRate>>16)&0xff),(byte)((byteRate>>24)&0xff)});
        out.write(new byte[]{2,0,16,0,'d','a','t','a'});
        out.write(new byte[]{(byte)(pcm.length & 0xff),(byte)((pcm.length>>8)&0xff),(byte)((pcm.length>>16)&0xff),(byte)((pcm.length>>24)&0xff)});
        out.write(pcm);
        return out.toByteArray();
    }

    private String normalizeText(String s) {
        return Normalizer.normalize((s == null ? "" : s).toLowerCase(), Normalizer.Form.NFD)
                .replaceAll("[\\p{InCombiningDiacriticalMarks}.?!,-]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private boolean containsWakeWord(String norm) {
        return norm.matches("(?s).*\\b(jarvis|javis|jarves|jaives|javes|iarvis|yarvis|djarvis|jarbas|chaves|jaires|jairbis|jarlb[iy]s?|jabi|jaips|gerbis|graves|jorps|de arvores|de arvies|ja vez|jar vis|ja vis|ja vi|ja viu)\\b.*");
    }

    private String stripWakeWord(String raw) {
        return (raw == null ? "" : raw)
                .replaceFirst("(?i)^(?:oi|ol[aá]|ei|ok|fala|al[oô]|e a[ií])?[,\\s.-]*(?:j\\.?a\\.?r\\.?v\\.?i\\.?s|j[aá]rvis|j[aá]vis|jarves|jaives|javes|iarvis|yarvis|djarvis|jarbas|chaves|jaires|jairbis|jarlb[iy]s?|j[aá]bi|jaips|gerbis|graves|jorps|de\\s+[aá]rvores|de\\s+arvies|j[aá]\\s+vez|jar\\s+vis|j[aá]\\s+vis|j[aá]\\s+vi|j[aá]\\s+viu)[,\\s.:!?-]*", "")
                .trim();
    }

    private void processVoiceClip(byte[] wavBytes) {
        boolean isAwake = System.currentTimeMillis() < awakeUntil;
        if (isAwake) showScreenGlow(2);

        try {
            String b64 = Base64.encodeToString(wavBytes, Base64.NO_WRAP);
            HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/api/v1/audio/transcribe").openConnection();
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/json");
            c.setConnectTimeout(5000);
            c.setReadTimeout(12000);
            c.setDoOutput(true);
            c.getOutputStream().write(("{\"audioBase64\":" + JSONObject.quote(b64) + "}").getBytes("UTF-8"));

            Scanner sc = new Scanner(c.getInputStream()).useDelimiter("\\A");
            JSONObject res = new JSONObject(sc.hasNext() ? sc.next() : "{}");
            String text = res.optString("text", "").trim();
            if (text.length() < 2) {
                if (isAwake && System.currentTimeMillis() < awakeUntil) showScreenGlow(1);
                else hideScreenGlow();
                return;
            }

            String norm = normalizeText(text);
            boolean hasWake = containsWakeWord(norm);
            if (!hasWake && !isAwake) {
                hideScreenGlow();
                return;
            }

            String cmd = stripWakeWord(text);

            // Disse apenas "Jarvis": toca o bipe duplo, acende borda VERMELHA por 10s e aguarda o comando!
            if (cmd.isEmpty()) {
                awakeUntil = System.currentTimeMillis() + 10000L;
                wakeScreenOnce();
                playChime(true);
                showScreenGlow(1);
                return;
            }

            String cClean = normalizeText(cmd);
            if (cClean.matches("^(obrigado|obrigada|valeu|so isso|pode descansar|dispensado|tchau|encerrar|parar)$")) {
                awakeUntil = 0L;
                hideScreenGlow();
                return;
            }

            // Comando completo capturado: fecha janela, mostra borda AZUL e executa na VM
            awakeUntil = 0L;
            isProcessing = true;
            playChime(false);
            showScreenGlow(2);
            executeCommandOnVm(cmd);
        } catch (Exception e) {
            isProcessing = false;
            awakeUntil = 0L;
            hideScreenGlow();
        }
    }

    private void executeCommandOnVm(String cmd) {
        try {
            String cNorm = normalizeText(cmd);

            if (cNorm.matches("^(que horas sao|que hora e|horas|qual o horario)$")) {
                String h = new SimpleDateFormat("HH:mm", new Locale("pt", "BR")).format(new Date());
                isProcessing = false;
                speakReply("Agora são " + h + ".");
                return;
            }
            if (cNorm.matches("^(que dia e hoje|qual a data de hoje|data de hoje)$")) {
                String d = new SimpleDateFormat("EEEE, d 'de' MMMM", new Locale("pt", "BR")).format(new Date());
                isProcessing = false;
                speakReply("Hoje é " + d + ".");
                return;
            }

            String screenReply = JarvisScreenController.tryExecuteCommand(this, cmd);
            if (screenReply != null) {
                isProcessing = false;
                speakReply(screenReply);
                return;
            }

            JSONObject sd = new JSONObject();
            String finalPrompt = cmd;

            if (cNorm.matches(".*(esta me vendo|ta me vendo|consegue me ver|voce me ve|ative a camera|ativar a camera|olhe para mim|olha pra mim|camera traseira|o que estou segurando).*")) {
                try {
                    boolean useRear = cNorm.contains("traseira") || cNorm.contains("tras");
                    Class<?> camCls = Class.forName("com.matheus.jarvis.JarvisHeadlessCamera");
                    Method cap = camCls.getMethod("captureFrameBase64", Context.class, boolean.class);
                    String camB64 = (String) cap.invoke(null, this, useRear);
                    if (camB64 != null) {
                        sd.put("webcamFrame", camB64);
                        sd.put("hasVision", true);
                    }
                } catch (Exception ignored) {}
            }

            if (cNorm.matches(".*(olhe minha tela|olha minha tela|leia a tela|o que esta na tela|analise minha tela).*")
                    && JarvisAccessibilityService.instance != null) {
                String screenText = JarvisAccessibilityService.instance.readScreenText();
                if (!screenText.isEmpty()) {
                    finalPrompt = cmd + "\n\n[CONTEÚDO VISÍVEL NA TELA DO CELULAR]: " + screenText;
                }
            }

            sd.put("type", "voice_or_text");
            sd.put("textPrompt", finalPrompt);
            sd.put("prompt", finalPrompt);

            HttpURLConnection ic = (HttpURLConnection) new URL(BASE + "/api/v1/webhook/ingress").openConnection();
            ic.setRequestMethod("POST");
            ic.setRequestProperty("Content-Type", "application/json");
            ic.setConnectTimeout(6000);
            ic.setReadTimeout(25000);
            ic.setDoOutput(true);
            JSONObject body = new JSONObject();
            body.put("identityToken", "Matheus-Admin");
            body.put("sessionId", "sess_main_admin");
            body.put("sensorData", sd);
            ic.getOutputStream().write(body.toString().getBytes("UTF-8"));

            Scanner isc = new Scanner(ic.getInputStream()).useDelimiter("\\A");
            JSONObject resp = new JSONObject(isc.hasNext() ? isc.next() : "{}");
            JSONObject dataObj = resp.optJSONObject("data");
            String reply = resp.optString("response", dataObj != null ? dataObj.optString("response", "Pronto.") : "Pronto.");

            isProcessing = false;
            speakReply(reply);
        } catch (Exception e) {
            isProcessing = false;
            awakeUntil = 0L;
            hideScreenGlow();
        }
    }

    private void speakReply(String text) {
        String clean = (text == null ? "" : text)
                .replaceAll("```[\\s\\S]*?```", "")
                .replaceAll("[*#_`~>|]", "")
                .trim();

        if (clean.isEmpty()) {
            awakeUntil = 0L;
            hideScreenGlow();
            return;
        }

        isSpeaking = true;
        showScreenGlow(3); // Borda CIANO = falando

        Runnable safetyUnlock = () -> {
            isSpeaking = false;
            awakeUntil = 0L;
            hideScreenGlow();
        };
        mainHandler.postDelayed(safetyUnlock, 20000L);

        String fetchedB64 = "";
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/api/v1/audio/speak").openConnection();
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/json");
            c.setConnectTimeout(4500);
            c.setReadTimeout(9000);
            c.setDoOutput(true);
            c.getOutputStream().write(("{\"text\":" + JSONObject.quote(clean) + "}").getBytes("UTF-8"));
            Scanner sc = new Scanner(c.getInputStream()).useDelimiter("\\A");
            fetchedB64 = new JSONObject(sc.hasNext() ? sc.next() : "{}").optString("audioBase64", "");
        } catch (Exception ignored) {}

        final String finalB64 = fetchedB64;
        mainHandler.post(() -> {
            boolean useAlarm = audioManager != null && audioManager.getStreamVolume(AudioManager.STREAM_MUSIC) <= 1;
            int usage = useAlarm ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_MEDIA;

            if (!finalB64.isEmpty()) {
                try {
                    File f = File.createTempFile("jv_", ".mp3", getCacheDir());
                    try (FileOutputStream fos = new FileOutputStream(f)) {
                        fos.write(Base64.decode(finalB64, Base64.DEFAULT));
                    }
                    MediaPlayer mp = new MediaPlayer();
                    mp.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
                    mp.setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(usage)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build());
                    mp.setVolume(1.0f, 1.0f);
                    mp.setDataSource(f.getAbsolutePath());
                    mp.setOnCompletionListener(m -> {
                        mainHandler.removeCallbacks(safetyUnlock);
                        try { m.release(); } catch (Exception ignored) {}
                        f.delete();
                        finishSpeaking(clean);
                    });
                    mp.setOnErrorListener((m, what, extra) -> {
                        mainHandler.removeCallbacks(safetyUnlock);
                        try { m.release(); } catch (Exception ignored) {}
                        f.delete();
                        speakWithNativeTts(clean, useAlarm, safetyUnlock);
                        return true;
                    });
                    mp.prepare();
                    mp.start();
                    return;
                } catch (Exception ignored) {}
            }
            speakWithNativeTts(clean, useAlarm, safetyUnlock);
        });
    }

    private void finishSpeaking(String clean) {
        mainHandler.postDelayed(() -> {
            isSpeaking = false;
            String cLow = normalizeText(clean);
            boolean follow = clean.endsWith("?")
                    || cLow.matches(".*(repita|repetir|nao entendi|nao compreendi|pode dizer|diga novamente|qual deles|qual contato|qual aparelho|qual comodo|confirma|estou ouvindo).*");
            if (follow) {
                awakeUntil = System.currentTimeMillis() + 10000L;
                playChime(true);
                showScreenGlow(1); // Reabre borda VERMELHA por 10s se o JARVIS fez uma pergunta
            } else {
                awakeUntil = 0L;
                hideScreenGlow(); // Apaga tudo para o celular descansar sem loops
            }
        }, 300L);
    }

    private void speakWithNativeTts(String text, boolean useAlarm, Runnable safetyUnlock) {
        if (nativeTts != null && ttsReady && !text.isEmpty()) {
            nativeTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) {}
                @Override public void onDone(String utteranceId) {
                    mainHandler.removeCallbacks(safetyUnlock);
                    finishSpeaking(text);
                }
                @Override public void onError(String utteranceId) {
                    mainHandler.removeCallbacks(safetyUnlock);
                    isSpeaking = false;
                    awakeUntil = 0L;
                    hideScreenGlow();
                }
            });
            Bundle params = new Bundle();
            params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM,
                    useAlarm ? AudioManager.STREAM_ALARM : AudioManager.STREAM_MUSIC);
            nativeTts.speak(text, TextToSpeech.QUEUE_FLUSH, params, "jarvis_reply");
        } else {
            mainHandler.removeCallbacks(safetyUnlock);
            isSpeaking = false;
            awakeUntil = 0L;
            hideScreenGlow();
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Intent restart = new Intent(getApplicationContext(), JarvisVoiceService.class);
        PendingIntent pi = PendingIntent.getService(this, 1, restart, PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE);
        AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + 800, pi);
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        running = false;
        hideScreenGlow();
        if (nativeTts != null) {
            try { nativeTts.stop(); nativeTts.shutdown(); } catch (Exception ignored) {}
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override public int onStartCommand(Intent i, int f, int id) { return START_STICKY; }
    @Override public IBinder onBind(Intent i) { return null; }
}

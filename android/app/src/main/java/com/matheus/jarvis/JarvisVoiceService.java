package com.matheus.jarvis;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.*;
import android.media.*;
import android.os.*;
import android.provider.Settings;
import android.util.Base64;
import android.view.*;
import android.widget.TextView;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;

public class JarvisVoiceService extends Service {
    public static volatile JarvisVoiceService instance;
    public static void wakeNow() { if (instance != null) { instance.awakeUntil = System.currentTimeMillis() + 20000L; instance.playBeep(); instance.showPill("🎙️ Ouvindo..."); } }
    private static final String BASE = "http://163.176.111.18";
    private static final int SAMPLE_RATE = 16000;
    private Handler mainHandler;
    private PowerManager.WakeLock wakeLock;
    private volatile boolean running = true;
    private volatile boolean isSpeaking = false;
    private volatile long awakeUntil = 0L;
    private TextView pillView;
    private WindowManager wm;
    private final ExecutorService netPool = Executors.newSingleThreadExecutor();

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        mainHandler = new Handler(Looper.getMainLooper());
        NotificationChannel ch = new NotificationChannel("jarvis_bg", "JARVIS Assistente 24h", NotificationManager.IMPORTANCE_LOW);
        getSystemService(NotificationManager.class).createNotificationChannel(ch);

        Notification notif = new NotificationCompat.Builder(this, "jarvis_bg")
            .setContentTitle("JARVIS Escuta Ativa 24h")
            .setContentText("Ouvindo 'Jarvis' mesmo com a tela apagada")
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
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "jarvis:always_on_mic");
        wakeLock.acquire();

        new Thread(this::audioCaptureLoop, "JarvisAudioSentinel").start();
    }

    private void playBeep() {
        try {
            ToneGenerator tg = new ToneGenerator(AudioManager.STREAM_ALARM, 85);
            tg.startTone(ToneGenerator.TONE_PROP_BEEP2, 130);
            mainHandler.postDelayed(tg::release, 220);
        } catch (Exception ignored) {}
    }

    private void showPill(String txt) {
        mainHandler.post(() -> {
            try {
                if (!Settings.canDrawOverlays(this)) return;
                if (wm == null) wm = (WindowManager) getSystemService(WINDOW_SERVICE);
                if (pillView == null) {
                    pillView = new TextView(this);
                    pillView.setBackgroundColor(Color.parseColor("#E60F172A"));
                    pillView.setTextColor(Color.parseColor("#38BDF8"));
                    pillView.setPadding(36, 18, 36, 18);
                    WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                        WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT);
                    lp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
                    lp.y = 140;
                    wm.addView(pillView, lp);
                }
                pillView.setText(txt);
                pillView.setVisibility(View.VISIBLE);
            } catch (Exception ignored) {}
        });
    }

    private void hidePill() {
        mainHandler.post(() -> { if (pillView != null) pillView.setVisibility(View.GONE); });
    }

    private void audioCaptureLoop() {
        int minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int chunkSize = Math.max(minBuf, 3200); // ~100ms por bloco
        byte[] buf = new byte[chunkSize];
        LinkedList<byte[]> preRoll = new LinkedList<>();
        ByteArrayOutputStream speechBuf = new ByteArrayOutputStream();
        boolean capturing = false;
        long lastVoiceMs = 0L;
        long captureStartMs = 0L;
        double noiseFloor = 180.0;
        AudioRecord recorder = null;

        while (running) {
            try {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
                    || MainActivity.isAppInForeground || isSpeaking) {
                    if (recorder != null) {
                        try { recorder.stop(); recorder.release(); } catch (Exception ignored) {}
                        recorder = null;
                    }
                    capturing = false;
                    speechBuf.reset();
                    preRoll.clear();
                    Thread.sleep(350);
                    continue;
                }

                if (System.currentTimeMillis() >= awakeUntil && !capturing) hidePill();

                if (recorder == null) {
                    recorder = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, SAMPLE_RATE,
                        AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, chunkSize * 4);
                    if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
                        recorder.release();
                        recorder = null;
                        Thread.sleep(1000);
                        continue;
                    }
                    recorder.startRecording();
                }

                int read = recorder.read(buf, 0, buf.length);
                if (read <= 0) continue;

                long sum = 0;
                for (int i = 0; i + 1 < read; i += 2) {
                    short s = (short) ((buf[i] & 0xff) | (buf[i + 1] << 8));
                    sum += (long) s * s;
                }
                double rms = Math.sqrt((double) sum / (read / 2.0));
                long now = System.currentTimeMillis();
                double threshold = Math.max(460.0, noiseFloor * 2.3);

                if (!capturing) {
                    noiseFloor = noiseFloor * 0.96 + Math.min(rms, 450.0) * 0.04;
                    byte[] copy = Arrays.copyOf(buf, read);
                    preRoll.addLast(copy);
                    if (preRoll.size() > 12) preRoll.removeFirst(); // Guarda 1.2s antes da fala

                    if (rms > threshold) {
                        capturing = true;
                        captureStartMs = now;
                        lastVoiceMs = now;
                        speechBuf.reset();
                        for (byte[] p : preRoll) speechBuf.write(p);
                        preRoll.clear();
                    }
                } else {
                    speechBuf.write(buf, 0, read);
                    if (rms > threshold * 0.85) lastVoiceMs = now;

                    if (now - lastVoiceMs > 950 || now - captureStartMs > 7000) {
                        capturing = false;
                        byte[] pcm = speechBuf.toByteArray();
                        speechBuf.reset();
                        if (pcm.length > 8000) {
                            byte[] wav = wrapWav(pcm, SAMPLE_RATE);
                            netPool.execute(() -> transcribeAndDispatch(wav));
                        }
                    }
                }
            } catch (Exception e) {
                try { Thread.sleep(500); } catch (Exception ignored) {}
            }
        }
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

    private void transcribeAndDispatch(byte[] wavBytes) {
        try {
            String b64 = Base64.encodeToString(wavBytes, Base64.NO_WRAP);
            HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/api/v1/audio/transcribe").openConnection();
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/json");
            c.setConnectTimeout(5000);
            c.setReadTimeout(8000);
            c.setDoOutput(true);
            c.getOutputStream().write(("{\"audioBase64\":" + JSONObject.quote(b64) + "}").getBytes("UTF-8"));

            Scanner sc = new Scanner(c.getInputStream()).useDelimiter("\\A");
            JSONObject res = new JSONObject(sc.hasNext() ? sc.next() : "{}");
            String text = res.optString("text", "").trim();
            if (text.length() < 2) return;

            String low = text.toLowerCase();
            boolean hasWake = low.matches(".*\\b(jarvis|j[aá]vis|jarves|javes|iarvis|jarbas|chaves)\\b.*");
            boolean isAwake = System.currentTimeMillis() < awakeUntil;
            if (!hasWake && !isAwake) return;

            String cmd = text.replaceFirst("(?i)^(?:oi|ol[aá]|ei|ok|fala)?[,\\s.-]*(?:jarvis|j[aá]vis|jarves|javes|iarvis|jarbas|chaves)[,\\s.:!?-]*", "").trim();
            if (cmd.isEmpty()) {
                if (!isAwake) playBeep();
                awakeUntil = System.currentTimeMillis() + 20000L;
                showPill("🎙️ Ouvindo...");
                return;
            }

            awakeUntil = System.currentTimeMillis() + 20000L;
            JarvisAccessibilityService acc = JarvisAccessibilityService.instance;
            String cl = cmd.toLowerCase();
            if (acc != null) {
                if (cl.startsWith("abrir ") || cl.startsWith("abra ")) {
                    String ap = cmd.replaceFirst("(?i)^(abrir|abra)\\s+", "").trim();
                    if (acc.launchApp(ap)) { speakCustom("Abrindo " + ap + "."); return; }
                }
                if (cl.equals("voltar")) { acc.performGlobalAction(1); speakCustom("Voltando."); return; }
                if (cl.contains("tela inicial")) { acc.performGlobalAction(2); speakCustom("Tela inicial."); return; }
                if (cl.startsWith("clicar em ") || cl.startsWith("toque em ")) {
                    String t = cmd.replaceFirst("(?i)^(clicar em|toque em)\\s+", "").trim();
                    boolean ok = acc.clickByText(t);
                    speakCustom(ok ? "Toquei em " + t + "." : "Não encontrei " + t + ".");
                    return;
                }
                if (cl.startsWith("digitar ") || cl.startsWith("escrever ")) {
                    String t = cmd.replaceFirst("(?i)^(digitar|escrever)\\s+", "").trim();
                    boolean ok = acc.inputText(t);
                    speakCustom(ok ? "Texto inserido." : "Selecione um campo primeiro.");
                    return;
                }
            }

            showPill("⚡ " + cmd);
            HttpURLConnection ic = (HttpURLConnection) new URL(BASE + "/api/v1/webhook/ingress").openConnection();
            ic.setRequestMethod("POST");
            ic.setRequestProperty("Content-Type", "application/json");
            ic.setDoOutput(true);
            JSONObject body = new JSONObject();
            body.put("identityToken", "Matheus-Admin");
            JSONObject sd = new JSONObject();
            sd.put("textPrompt", cmd);
            body.put("sensorData", sd);
            ic.getOutputStream().write(body.toString().getBytes("UTF-8"));

            Scanner isc = new Scanner(ic.getInputStream()).useDelimiter("\\A");
            JSONObject resp = new JSONObject(isc.hasNext() ? isc.next() : "{}");
            String reply = resp.optString("response", resp.optJSONObject("data") != null ? resp.optJSONObject("data").optString("response", "Pronto.") : "Pronto.");
            speakCustom(reply);
        } catch (Exception ignored) {}
    }

    private void speakCustom(String text) {
        isSpeaking = true;
        showPill("🔊 " + text);
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/api/v1/audio/speak").openConnection();
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/json");
            c.setDoOutput(true);
            c.getOutputStream().write(("{\"text\":" + JSONObject.quote(text) + "}").getBytes("UTF-8"));
            Scanner sc = new Scanner(c.getInputStream()).useDelimiter("\\A");
            JSONObject j = new JSONObject(sc.hasNext() ? sc.next() : "{}");
            String b64 = j.optString("audioBase64", "");
            if (!b64.isEmpty()) {
                File f = File.createTempFile("jv_", ".mp3", getCacheDir());
                FileOutputStream fos = new FileOutputStream(f);
                fos.write(Base64.decode(b64, Base64.DEFAULT));
                fos.close();
                MediaPlayer mp = new MediaPlayer();
                mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
                mp.setDataSource(f.getAbsolutePath());
                mp.prepare();
                mp.setOnCompletionListener(m -> {
                    m.release();
                    f.delete();
                    isSpeaking = false;
                    awakeUntil = System.currentTimeMillis() + 20000L;
                    showPill("🎙️ Pode continuar...");
                });
                mp.start();
                return;
            }
        } catch (Exception ignored) {}
        isSpeaking = false;
        awakeUntil = System.currentTimeMillis() + 20000L;
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
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override public int onStartCommand(Intent i, int f, int id) { return START_STICKY; }
    @Override public IBinder onBind(Intent i) { return null; }
}

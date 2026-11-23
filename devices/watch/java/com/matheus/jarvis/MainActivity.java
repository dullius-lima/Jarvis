package com.matheus.jarvis;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends Activity {
    public static volatile boolean isAppInForeground = false;
    public static volatile TextView liveStatusView;
    private boolean forceTokenScreen = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        renderUI();
    }

    private void renderUI() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.BLACK);
        root.setPadding(24, 20, 24, 20);

        if (!JarvisDeviceIdentity.isPaired(this) || forceTokenScreen) {
            TextView title = new TextView(this);
            title.setText("🔐 VINCULAR RELÓGIO");
            title.setTextColor(Color.parseColor("#FBBF24"));
            title.setTextSize(13f);
            title.setGravity(Gravity.CENTER);
            root.addView(title);

            EditText codeBox = new EditText(this);
            codeBox.setHint("JRV-XXXX-XXXX");
            codeBox.setHintTextColor(Color.GRAY);
            codeBox.setTextColor(Color.parseColor("#22D3EE"));
            codeBox.setTextSize(13f);
            codeBox.setGravity(Gravity.CENTER);
            codeBox.setSingleLine(true);
            root.addView(codeBox);

            liveStatusView = new TextView(this);
            liveStatusView.setText("Cole o código da aba Dispositivos");
            liveStatusView.setTextColor(Color.parseColor("#94A3B8"));
            liveStatusView.setTextSize(10.5f);
            liveStatusView.setGravity(Gravity.CENTER);
            root.addView(liveStatusView);

            Button btnPair = new Button(this);
            btnPair.setText("✅ ATIVAR");
            btnPair.setTextColor(Color.BLACK);
            btnPair.setBackgroundColor(Color.parseColor("#22D3EE"));
            btnPair.setOnClickListener(v -> {
                String c = codeBox.getText().toString().trim();
                liveStatusView.setText("Validando...");
                new Thread(() -> {
                    String r = JarvisDeviceIdentity.pairWithCode(this, c);
                    runOnUiThread(() -> {
                        if (r.startsWith("OK:")) {
                            forceTokenScreen = false;
                            renderUI();
                        } else {
                            liveStatusView.setText("❌ " + r);
                        }
                    });
                }).start();
            });
            root.addView(btnPair);
            setContentView(root);
            return;
        }

        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(Color.parseColor("#081226"));
        ring.setStroke(6, Color.parseColor("#22D3EE"));

        TextView orb = new TextView(this);
        orb.setText("🎙️\nJARVIS");
        orb.setTextColor(Color.parseColor("#38BDF8"));
        orb.setTextSize(15f);
        orb.setGravity(Gravity.CENTER);
        orb.setBackground(ring);
        int sz = (int) (116 * getResources().getDisplayMetrics().density);
        root.addView(orb, new LinearLayout.LayoutParams(sz, sz));

        liveStatusView = new TextView(this);
        liveStatusView.setText("🟢 " + JarvisDeviceIdentity.getCustomName(this));
        liveStatusView.setTextColor(Color.parseColor("#34D399"));
        liveStatusView.setTextSize(11f);
        liveStatusView.setGravity(Gravity.CENTER);
        liveStatusView.setPadding(4, 10, 4, 4);
        root.addView(liveStatusView);

        TextView btnChangeTok = new TextView(this);
        btnChangeTok.setText("🔑 Token");
        btnChangeTok.setTextColor(Color.parseColor("#94A3B8"));
        btnChangeTok.setTextSize(10f);
        btnChangeTok.setPadding(8, 4, 8, 4);
        btnChangeTok.setOnClickListener(v -> { forceTokenScreen = true; renderUI(); });
        root.addView(btnChangeTok);

        setContentView(root);
        orb.setOnClickListener(v -> triggerWatchVoice());
        startWatchVoice();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (JarvisDeviceIdentity.isPaired(this)) triggerWatchVoice();
    }

    private void startWatchVoice() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.POST_NOTIFICATIONS
            }, 301);
            return;
        }
        triggerWatchVoice();
    }

    @Override
    public void onRequestPermissionsResult(int rc, String[] p, int[] g) {
        super.onRequestPermissionsResult(rc, p, g);
        triggerWatchVoice();
    }

    private void triggerWatchVoice() {
        if (!JarvisDeviceIdentity.isPaired(this)) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;
        Intent i = new Intent(this, JarvisVoiceService.class);
        i.setAction("ACTION_WAKE_NOW");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(i);
        else startService(i);
        JarvisVoiceService.wakeNow();
        if (liveStatusView != null) liveStatusView.setText("🎙️ Fale agora...");
    }

    @Override protected void onResume() { super.onResume(); isAppInForeground = true; }
    @Override protected void onPause() { isAppInForeground = false; super.onPause(); }
}

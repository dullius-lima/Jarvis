package com.matheus.jarvis;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.KeyEvent;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends Activity {
    public static volatile boolean isAppInForeground = false;
    public static volatile TextView liveStatusView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#060B14"));
        root.setPadding(64, 48, 64, 48);

        TextView title = new TextView(this);
        title.setText("JARVIS WATCH");
        title.setTextColor(Color.parseColor("#38BDF8"));
        title.setTextSize(22f);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        liveStatusView = new TextView(this);
        liveStatusView.setText("Pronto • Pressione o botão de microfone do controle ou clique abaixo");
        liveStatusView.setTextColor(Color.parseColor("#94A3B8"));
        liveStatusView.setTextSize(15f);
        liveStatusView.setGravity(Gravity.CENTER);
        liveStatusView.setPadding(0, 16, 0, 32);
        root.addView(liveStatusView);

        Button btnTalk = makeBtn("🎙️  FALAR COM O JARVIS AGORA", "#0284C7");
        btnTalk.setOnClickListener(v -> { startTvService(); JarvisVoiceService.wakeNow(); });
        root.addView(btnTalk, btnLp());

        Button btnAcc = makeBtn("♿  ATIVAR CONTROLE TOTAL DA TV (ACESSIBILIDADE)", "#1E293B");
        btnAcc.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        root.addView(btnAcc, btnLp());

        setContentView(root);
        btnTalk.requestFocus();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS}, 201);
        } else startTvService();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_VOICE_ASSIST || keyCode == KeyEvent.KEYCODE_ASSIST || keyCode == KeyEvent.KEYCODE_SEARCH) {
            startTvService();
            JarvisVoiceService.wakeNow();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private Button makeBtn(String t, String hex) {
        Button b = new Button(this);
        b.setText(t); b.setTextColor(Color.WHITE); b.setTextSize(15f);
        b.setFocusable(true); b.setFocusableInTouchMode(true);
        GradientDrawable g = new GradientDrawable();
        g.setColor(Color.parseColor(hex)); g.setCornerRadius(16f); g.setStroke(2, Color.parseColor("#38BDF8"));
        b.setBackground(g); b.setPadding(32, 20, 32, 20);
        return b;
    }

    private LinearLayout.LayoutParams btnLp() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(700, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, 12, 0, 12);
        return lp;
    }

    private void startTvService() {
        Intent i = new Intent(this, JarvisVoiceService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(i); else startService(i);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            try { startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))); } catch (Exception ignored) {}
        }
    }
    @Override protected void onResume() { super.onResume(); isAppInForeground = true; }
    @Override protected void onPause() { isAppInForeground = false; super.onPause(); }
}

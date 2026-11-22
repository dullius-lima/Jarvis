package com.matheus.jarvis;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.view.Display;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.TextView;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public class JarvisSensoryHelper {
    private static TextView statusPill;
    private static WindowManager wmRef;

    public static void showIdentificationPill(Context ctx, String label) {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                if (!Settings.canDrawOverlays(ctx)) return;
                if (wmRef == null) wmRef = (WindowManager) ctx.getApplicationContext().getSystemService(Context.WINDOW_SERVICE);
                if (statusPill == null) {
                    statusPill = new TextView(ctx.getApplicationContext());
                    statusPill.setTextColor(Color.parseColor("#E0F2FE"));
                    statusPill.setTextSize(12f);
                    statusPill.setPadding(32, 14, 32, 14);
                    GradientDrawable bg = new GradientDrawable();
                    bg.setColor(Color.parseColor("#E60F172A"));
                    bg.setCornerRadius(48f);
                    bg.setStroke(3, Color.parseColor("#22D3EE"));
                    statusPill.setBackground(bg);

                    WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                            WindowManager.LayoutParams.WRAP_CONTENT,
                            WindowManager.LayoutParams.WRAP_CONTENT,
                            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                            PixelFormat.TRANSLUCENT
                    );
                    lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
                    lp.y = 95;
                    wmRef.addView(statusPill, lp);
                }
                statusPill.setText(label);
                statusPill.setVisibility(android.view.View.VISIBLE);
            } catch (Exception ignored) {}
        });
    }

    public static void hideIdentificationPill() {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                if (statusPill != null) statusPill.setVisibility(android.view.View.GONE);
            } catch (Exception ignored) {}
        });
    }

    public static void handleCaptureRequest(Context ctx, String deviceId, String requestId, String modality, String facing) {
        boolean isScreen = "screen".equalsIgnoreCase(modality);
        showIdentificationPill(ctx, isScreen
                ? "🖥️ TELA ATIVA • Galaxy S25 | Sob demanda (0 tokens)"
                : "📷 CÂMERA ATIVA (" + ("back".equalsIgnoreCase(facing) ? "Traseira" : "Frontal") + ") • Galaxy S25");

        new Thread(() -> {
            String frame = isScreen
                    ? captureAccessibilityScreen()
                    : JarvisHeadlessCamera.captureBase64(ctx, facing);
            postFrame(requestId, deviceId, frame);
        }).start();
    }

    public static String captureAccessibilityScreen() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || JarvisAccessibilityService.instance == null) return null;
        AtomicReference<String> ref = new AtomicReference<>(null);
        CountDownLatch latch = new CountDownLatch(1);
        try {
            JarvisAccessibilityService.instance.takeScreenshot(
                Display.DEFAULT_DISPLAY,
                JarvisAccessibilityService.instance.getMainExecutor(),
                new android.accessibilityservice.AccessibilityService.TakeScreenshotCallback() {
                    @Override
                    public void onSuccess(android.accessibilityservice.AccessibilityService.ScreenshotResult res) {
                        try {
                            Bitmap bmp = Bitmap.wrapHardwareBuffer(res.getHardwareBuffer(), res.getColorSpace());
                            if (bmp != null) {
                                Bitmap sw = bmp.copy(Bitmap.Config.ARGB_8888, false);
                                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                                sw.compress(Bitmap.CompressFormat.JPEG, 70, baos);
                                ref.set("data:image/jpeg;base64," + Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP));
                                sw.recycle();
                                bmp.recycle();
                            }
                            res.getHardwareBuffer().close();
                        } catch (Exception ignored) {}
                        latch.countDown();
                    }
                    @Override
                    public void onFailure(int errorCode) { latch.countDown(); }
                }
            );
            latch.await(2500, TimeUnit.MILLISECONDS);
        } catch (Exception ignored) {}
        return ref.get();
    }

    private static void postFrame(String requestId, String deviceId, String imageBase64) {
        try {
            URL url = new URL("http://163.176.111.18/api/v1/sensory/frame");
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/json");
            c.setConnectTimeout(3000);
            c.setReadTimeout(3000);
            c.setDoOutput(true);
            JSONObject body = new JSONObject();
            body.put("requestId", requestId);
            body.put("deviceId", deviceId);
            if (imageBase64 != null) body.put("imageBase64", imageBase64);
            try (OutputStream os = c.getOutputStream()) {
                os.write(body.toString().getBytes("UTF-8"));
            }
            c.getResponseCode();
            c.disconnect();
        } catch (Exception ignored) {}
    }
}

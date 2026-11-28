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
    private static volatile boolean liveArmed = false;
    private static volatile String activeModality = "screen";
    private static volatile String lastCachedScreenB64 = null;
    private static volatile long lastScreenAtMs = 0L;

    public static void showIdentificationPill(Context ctx, String label) {
        if (SensitiveAppGuard.isProtectedNow()) return;
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                Context appCtx = ctx.getApplicationContext();
                if (SensitiveAppGuard.isProtectedNow() || !Settings.canDrawOverlays(appCtx)) return;
                if (wmRef == null) wmRef = (WindowManager) appCtx.getSystemService(Context.WINDOW_SERVICE);
                if (statusPill == null) {
                    statusPill = new TextView(appCtx);
                    statusPill.setTextColor(Color.parseColor("#E0F2FE"));
                    statusPill.setTextSize(12f);
                    statusPill.setPadding(32, 14, 32, 14);
                    GradientDrawable bg = new GradientDrawable();
                    bg.setColor(Color.parseColor("#E60F172A"));
                    bg.setCornerRadius(48f);
                    bg.setStroke(3, Color.parseColor("#22D3EE"));
                    statusPill.setBackground(bg);
                    statusPill.setOnClickListener(v -> {
                        liveArmed = false;
                        hideIdentificationPill();
                    });

                    WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                        WindowManager.LayoutParams.WRAP_CONTENT,
                        WindowManager.LayoutParams.WRAP_CONTENT,
                        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
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
        liveArmed = false;
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                if (statusPill != null) statusPill.setVisibility(android.view.View.GONE);
            } catch (Exception ignored) {}
        });
    }

    public static void onSecurityLockChanged(Context ctx, boolean locked) {
        if (locked) {
            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    if (statusPill != null) statusPill.setVisibility(android.view.View.GONE);
                } catch (Exception ignored) {}
            });
        } else if (liveArmed && ctx != null) {
            String pillLabel = "screen".equals(activeModality)
                ? "👁️ Tela compartilhada • ✕"
                : "📷 Câmera JARVIS ativa • ✕";
            showIdentificationPill(ctx, pillLabel);
        }
    }

    public static void handleCaptureRequest(Context ctx, String deviceId, String requestId, String modality, String facing, boolean keepArmed) {
        handleCaptureRequest(ctx, deviceId, requestId, modality, facing, keepArmed, false);
    }

    public static void handleCaptureRequest(Context ctx, String deviceId, String requestId, String modality, String facing, boolean keepArmed, boolean allowContacts) {
        if (SensitiveAppGuard.isProtectedNow()) {
            new Thread(() -> postFrame(ctx, requestId, deviceId, null, "bank_or_password")).start();
            return;
        }
        boolean isScreen = "screen".equalsIgnoreCase(modality);
        if (isScreen && SensitiveAppGuard.isContactsScreenActive() && !allowContacts) {
            new Thread(() -> postFrame(ctx, requestId, deviceId, null, "contacts_privacy")).start();
            return;
        }
        if (isScreen && JarvisAccessibilityService.instance == null) {
            new Thread(() -> postFrame(ctx, requestId, deviceId, null, "accessibility_disabled")).start();
            return;
        }
        if (keepArmed) {
            liveArmed = true;
            activeModality = isScreen ? "screen" : "camera";
            showIdentificationPill(ctx, isScreen ? "👁️ Tela compartilhada • ✕" : "📷 Câmera JARVIS ativa • ✕");
        }

        new Thread(() -> {
            if (SensitiveAppGuard.isProtectedNow()) {
                postFrame(ctx, requestId, deviceId, null, "bank_or_password");
                return;
            }
            if (isScreen) {
                AtomicReference<String> blockRef = new AtomicReference<>(null);
                String frame = captureAccessibilityScreen(blockRef);
                if (blockRef.get() != null) {
                    postFrame(ctx, requestId, deviceId, null, blockRef.get());
                    return;
                }
                postFrame(ctx, requestId, deviceId, frame, null);
            } else {
                String frame = JarvisHeadlessCamera.captureBase64(ctx, facing);
                postFrame(ctx, requestId, deviceId, frame, null);
            }
        }).start();
    }

    public static String captureAccessibilityScreen() {
        return captureAccessibilityScreen(new AtomicReference<>(null));
    }

    public static String captureAccessibilityScreen(AtomicReference<String> blockReasonOut) {
        if (SensitiveAppGuard.isProtectedNow()) {
            blockReasonOut.set("bank_or_password");
            return null;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || JarvisAccessibilityService.instance == null) {
            blockReasonOut.set("accessibility_disabled");
            return null;
        }
        long now = System.currentTimeMillis();
        if (lastCachedScreenB64 != null && (now - lastScreenAtMs) < 900L) {
            return lastCachedScreenB64;
        }
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
                            if (SensitiveAppGuard.isProtectedNow()) {
                                blockReasonOut.set("bank_or_password");
                                res.getHardwareBuffer().close();
                                latch.countDown();
                                return;
                            }
                            Bitmap bmp = Bitmap.wrapHardwareBuffer(res.getHardwareBuffer(), res.getColorSpace());
                            if (bmp != null) {
                                Bitmap sw = bmp.copy(Bitmap.Config.ARGB_8888, false);
                                bmp.recycle();
                                int w = sw.getWidth();
                                int h = sw.getHeight();
                                Bitmap scaled = sw;
                                if (w > 1080) {
                                    int nh = Math.round((1080f / w) * h);
                                    scaled = Bitmap.createScaledBitmap(sw, 1080, nh, true);
                                    sw.recycle();
                                }
                                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                                scaled.compress(Bitmap.CompressFormat.JPEG, 72, baos);
                                String encoded = "data:image/jpeg;base64," + Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
                                ref.set(encoded);
                                lastCachedScreenB64 = encoded;
                                lastScreenAtMs = System.currentTimeMillis();
                                scaled.recycle();
                            }
                            res.getHardwareBuffer().close();
                        } catch (Exception ignored) {}
                        latch.countDown();
                    }
                    @Override
                    public void onFailure(int errorCode) {
                        // errorCode 2 = ERROR_TAKE_SCREENSHOT_SECURE_WINDOW (janela com FLAG_SECURE, banco ou senha)
                        if (errorCode == 2) {
                            blockReasonOut.set("bank_or_password");
                        }
                        latch.countDown();
                    }
                }
            );
            latch.await(3200, TimeUnit.MILLISECONDS);
        } catch (Exception ignored) {}
        return ref.get();
    }

    private static void postFrame(Context ctx, String requestId, String deviceId, String imageBase64, String blockedReason) {
        try {
            String devId = JarvisDeviceIdentity.getDeviceId(ctx);
            String devTok = JarvisDeviceIdentity.getDeviceToken(ctx);
            URL url = new URL("http://163.176.111.18/api/v1/sensory/frame");
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("x-device-id", devId.isEmpty() ? deviceId : devId);
            c.setRequestProperty("x-device-token", devTok);
            c.setConnectTimeout(4000);
            c.setReadTimeout(4000);
            c.setDoOutput(true);
            JSONObject body = new JSONObject();
            body.put("requestId", requestId);
            body.put("deviceId", devId.isEmpty() ? deviceId : devId);
            body.put("deviceToken", devTok);
            body.put("blockedSensitive", blockedReason != null);
            if (blockedReason != null) body.put("blockedReason", blockedReason);
            if (blockedReason == null && imageBase64 != null) body.put("imageBase64", imageBase64);
            try (OutputStream os = c.getOutputStream()) {
                os.write(body.toString().getBytes("UTF-8"));
            }
            c.getResponseCode();
            c.disconnect();
        } catch (Exception ignored) {}
    }
}

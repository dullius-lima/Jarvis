package com.matheus.jarvis;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.hardware.camera2.*;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import java.nio.ByteBuffer;
import java.util.Collections;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public class JarvisHeadlessCamera {
    public static String captureBase64(Context ctx, String facing) {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            return null;
        }
        HandlerThread ht = new HandlerThread("JarvisCamThread");
        ht.start();
        Handler h = new Handler(ht.getLooper());
        AtomicReference<String> result = new AtomicReference<>(null);
        AtomicInteger frameCount = new AtomicInteger(0);
        CountDownLatch latch = new CountDownLatch(1);
        final CameraDevice[] camRef = new CameraDevice[1];
        ImageReader reader = null;

        try {
            CameraManager cm = (CameraManager) ctx.getSystemService(Context.CAMERA_SERVICE);
            if (cm == null) return null;
            int desired = "back".equalsIgnoreCase(facing)
                    ? CameraCharacteristics.LENS_FACING_BACK
                    : CameraCharacteristics.LENS_FACING_FRONT;
            String chosenId = null;
            for (String id : cm.getCameraIdList()) {
                CameraCharacteristics cc = cm.getCameraCharacteristics(id);
                Integer lens = cc.get(CameraCharacteristics.LENS_FACING);
                if (chosenId == null) chosenId = id;
                if (lens != null && lens == desired) { chosenId = id; break; }
            }
            if (chosenId == null) return null;

            reader = ImageReader.newInstance(640, 480, ImageFormat.JPEG, 3);
            final ImageReader fReader = reader;
            reader.setOnImageAvailableListener(r -> {
                Image img = null;
                try {
                    img = r.acquireLatestImage();
                    if (img != null && frameCount.incrementAndGet() >= 3 && result.get() == null) {
                        ByteBuffer buf = img.getPlanes()[0].getBuffer();
                        byte[] bytes = new byte[buf.remaining()];
                        buf.get(bytes);
                        result.set("data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
                        latch.countDown();
                    }
                } catch (Exception ignored) {
                } finally {
                    if (img != null) img.close();
                }
            }, h);

            cm.openCamera(chosenId, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(CameraDevice camera) {
                    camRef[0] = camera;
                    try {
                        CaptureRequest.Builder req = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                        req.addTarget(fReader.getSurface());
                        req.set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO);
                        req.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON);
                        camera.createCaptureSession(Collections.singletonList(fReader.getSurface()), new CameraCaptureSession.StateCallback() {
                            @Override
                            public void onConfigured(CameraCaptureSession session) {
                                try {
                                    session.setRepeatingRequest(req.build(), null, h);
                                } catch (Exception e) { latch.countDown(); }
                            }
                            @Override public void onConfigureFailed(CameraCaptureSession session) { latch.countDown(); }
                        }, h);
                    } catch (Exception e) { latch.countDown(); }
                }
                @Override public void onDisconnected(CameraDevice camera) { camera.close(); latch.countDown(); }
                @Override public void onError(CameraDevice camera, int error) { camera.close(); latch.countDown(); }
            }, h);

            latch.await(4000, TimeUnit.MILLISECONDS);
        } catch (Exception ignored) {
        } finally {
            try { if (camRef[0] != null) camRef[0].close(); } catch (Exception ignored) {}
            try { if (reader != null) reader.close(); } catch (Exception ignored) {}
            ht.quitSafely();
        }
        return result.get();
    }
}

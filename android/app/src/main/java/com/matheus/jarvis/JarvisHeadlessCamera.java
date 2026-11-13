package com.matheus.jarvis;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
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
import java.util.concurrent.atomic.AtomicReference;

public class JarvisHeadlessCamera {

    public static String captureFrameBase64(Context context, boolean useRearCamera) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            return null;
        }

        HandlerThread thread = new HandlerThread("JarvisCamCapture");
        thread.start();
        Handler handler = new Handler(thread.getLooper());

        AtomicReference<String> resultB64 = new AtomicReference<>(null);
        AtomicReference<CameraDevice> camRef = new AtomicReference<>(null);
        ImageReader reader = null;

        try {
            CameraManager manager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
            if (manager == null) return null;

            int desiredFacing = useRearCamera
                ? CameraCharacteristics.LENS_FACING_BACK
                : CameraCharacteristics.LENS_FACING_FRONT;

            String selectedId = null;
            for (String id : manager.getCameraIdList()) {
                CameraCharacteristics chars = manager.getCameraCharacteristics(id);
                Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
                if (facing != null && facing == desiredFacing) {
                    selectedId = id;
                    break;
                }
            }
            if (selectedId == null && manager.getCameraIdList().length > 0) {
                selectedId = manager.getCameraIdList()[0];
            }
            if (selectedId == null) return null;

            CountDownLatch latch = new CountDownLatch(1);
            reader = ImageReader.newInstance(640, 480, ImageFormat.JPEG, 1);
            reader.setOnImageAvailableListener(r -> {
                Image img = null;
                try {
                    img = r.acquireLatestImage();
                    if (img != null) {
                        ByteBuffer buffer = img.getPlanes()[0].getBuffer();
                        byte[] bytes = new byte[buffer.remaining()];
                        buffer.get(bytes);
                        String b64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                        resultB64.set("data:image/jpeg;base64," + b64);
                    }
                } catch (Exception ignored) {
                } finally {
                    if (img != null) img.close();
                    latch.countDown();
                }
            }, handler);

            final ImageReader finalReader = reader;
            manager.openCamera(selectedId, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(CameraDevice camera) {
                    camRef.set(camera);
                    try {
                        camera.createCaptureSession(
                            Collections.singletonList(finalReader.getSurface()),
                            new CameraCaptureSession.StateCallback() {
                                @Override
                                public void onConfigured(CameraCaptureSession session) {
                                    try {
                                        CaptureRequest.Builder req = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
                                        req.addTarget(finalReader.getSurface());
                                        req.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                                        req.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
                                        session.capture(req.build(), null, handler);
                                    } catch (Exception e) {
                                        latch.countDown();
                                    }
                                }

                                @Override
                                public void onConfigureFailed(CameraCaptureSession session) {
                                    latch.countDown();
                                }
                            },
                            handler
                        );
                    } catch (Exception e) {
                        latch.countDown();
                    }
                }

                @Override
                public void onDisconnected(CameraDevice camera) {
                    camera.close();
                    latch.countDown();
                }

                @Override
                public void onError(CameraDevice camera, int error) {
                    camera.close();
                    latch.countDown();
                }
            }, handler);

            latch.await(4500, TimeUnit.MILLISECONDS);
        } catch (Exception ignored) {
        } finally {
            CameraDevice cam = camRef.get();
            if (cam != null) {
                try { cam.close(); } catch (Exception ignored) {}
            }
            if (reader != null) {
                try { reader.close(); } catch (Exception ignored) {}
            }
            thread.quitSafely();
        }

        return resultB64.get();
    }
}
